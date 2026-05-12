import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { agentCall } from "../agent.js";
import { Db } from "../db/schema.js";
import { AppConfig } from "../config.js";
import { buildQueue } from "../buildQueue.js";

interface BuildBody {
  name: string;
  repo_url: string;
  repo_branch?: string;
  deploy_path: string;
  post_command?: string;
  has_submodules?: boolean;
}

export default async function buildRoutes(
  app: FastifyInstance,
  { db, cfg }: { db: Db; cfg: AppConfig }
) {
  const socket = cfg.agent.socket;

  app.get("/api/builds", async () => {
    return db.prepare("SELECT * FROM builds ORDER BY created_at DESC").all();
  });

  app.get<{ Params: { id: string } }>("/api/builds/:id", async (req, reply) => {
    const build = db.prepare("SELECT * FROM builds WHERE id = ?").get(req.params.id);
    if (!build) return reply.status(404).send({ error: "not found" });
    const runs = db.prepare("SELECT * FROM build_runs WHERE build_id = ? ORDER BY id DESC LIMIT 20").all(req.params.id);
    return { build, runs };
  });

  app.post<{ Body: BuildBody }>("/api/builds", async (req, reply) => {
    const { name, repo_url, repo_branch = "main", deploy_path, post_command, has_submodules = false } = req.body;
    if (!name || !repo_url || !deploy_path)
      return reply.status(400).send({ error: "name, repo_url, deploy_path required" });

    const build_key = nanoid(24);
    const result = db.prepare(`
      INSERT INTO builds (name, repo_url, repo_branch, deploy_path, build_key, post_command, has_submodules)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, repo_url, repo_branch, deploy_path, build_key, post_command ?? null, has_submodules ? 1 : 0);

    return db.prepare("SELECT * FROM builds WHERE id = ?").get(result.lastInsertRowid);
  });

  app.put<{ Params: { id: string }; Body: BuildBody }>("/api/builds/:id", async (req, reply) => {
    const { name, repo_url, repo_branch = "main", deploy_path, post_command, has_submodules = false } = req.body;
    db.prepare(`
      UPDATE builds SET name=?, repo_url=?, repo_branch=?, deploy_path=?, post_command=?, has_submodules=? WHERE id=?
    `).run(name, repo_url, repo_branch, deploy_path, post_command ?? null, has_submodules ? 1 : 0, req.params.id);
    return db.prepare("SELECT * FROM builds WHERE id = ?").get(req.params.id);
  });

  app.delete<{ Params: { id: string } }>("/api/builds/:id", async (req) => {
    db.prepare("DELETE FROM builds WHERE id = ?").run(req.params.id);
    return { ok: true };
  });

  // Purge deploy directory
  app.post<{ Params: { id: string } }>("/api/builds/:id/purge", async (req, reply) => {
    const build = db.prepare("SELECT * FROM builds WHERE id = ?").get(req.params.id) as any;
    if (!build) return reply.status(404).send({ error: "not found" });
    const res = await agentCall(socket, "fs.remove_dir", { path: build.deploy_path });
    if (!res.ok) return reply.status(500).send({ error: res.error ?? "purge failed" });
    return { ok: true };
  });

  // Enqueue a build run — returns immediately with run_id and queue position
  app.post<{ Params: { id: string } }>("/api/builds/:id/run", async (req, reply) => {
    const build = db.prepare("SELECT * FROM builds WHERE id = ?").get(req.params.id) as any;
    if (!build) return reply.status(404).send({ error: "not found" });
    const { runId, position } = buildQueue.enqueue(db, build);
    return { run_id: runId, position };
  });

  // SSE stream for a specific build run
  app.get<{ Params: { runId: string } }>("/api/builds/runs/:runId/stream", async (req, reply) => {
    const runId = parseInt(req.params.runId, 10);
    if (isNaN(runId)) return reply.status(400).send({ error: "invalid run id" });

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.flushHeaders();

    const sse = (data: object) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    const run = db.prepare("SELECT * FROM build_runs WHERE id = ?").get(runId) as any;
    if (!run) {
      sse({ error: "not found" });
      reply.raw.end();
      return;
    }

    // Already finished — replay from DB and close
    if (run.status === "success" || run.status === "failed") {
      (run.output ?? "").split("\n").filter(Boolean).forEach((line: string) => sse({ line }));
      sse({ status: run.status });
      reply.raw.end();
      return;
    }

    const emitter = buildQueue.getEmitter(runId);

    if (run.status === "queued") {
      const { c: ahead } = db.prepare(
        "SELECT COUNT(*) as c FROM build_runs WHERE status IN ('queued','running') AND id < ?"
      ).get(runId) as any;
      sse({ queued: true, position: Number(ahead) + 1 });

      // Subscribe before checking DB again to avoid race
      let startedResolve!: () => void;
      const startedPromise = new Promise<void>((resolve) => { startedResolve = resolve; });
      emitter.once("started", startedResolve);

      // Check if it already transitioned (race-free: event is registered above)
      const fresh = db.prepare("SELECT status FROM build_runs WHERE id = ?").get(runId) as any;
      if (fresh?.status === "queued") {
        await Promise.race([
          startedPromise,
          new Promise<void>((resolve) => req.raw.once("close", resolve)),
        ]);
      } else {
        emitter.off("started", startedResolve);
      }

      if (reply.raw.writableEnded) return;
      sse({ running: true });
    }

    // Stream live output (status may have changed to 'running' at this point)
    const current = db.prepare("SELECT output FROM build_runs WHERE id = ?").get(runId) as any;
    (current?.output ?? "").split("\n").filter(Boolean).forEach((line: string) => sse({ line }));

    await new Promise<void>((resolve) => {
      const onLine = (line: string) => sse({ line });
      const onStatus = (status: string) => {
        sse({ status });
        cleanup();
        resolve();
      };
      const onClose = () => { cleanup(); resolve(); };

      const cleanup = () => {
        emitter.off("line", onLine);
        emitter.off("status", onStatus);
        req.raw.off("close", onClose);
      };

      emitter.on("line", onLine);
      emitter.once("status", onStatus);
      req.raw.once("close", onClose);

      // If already finished between replay and subscribe, emit from DB
      const check = db.prepare("SELECT status FROM build_runs WHERE id = ?").get(runId) as any;
      if (check?.status === "success" || check?.status === "failed") {
        onStatus(check.status);
      }
    });

    reply.raw.end();
  });

  // Current queue state (running + waiting)
  app.get("/api/builds/queue", async () => {
    return db.prepare(`
      SELECT br.id as run_id, br.build_id, b.name, br.status, br.queued_at
      FROM build_runs br
      JOIN builds b ON b.id = br.build_id
      WHERE br.status IN ('queued', 'running')
      ORDER BY br.id ASC
    `).all();
  });
}
