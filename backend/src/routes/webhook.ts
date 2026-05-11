import { FastifyInstance } from "fastify";
import { Db } from "../db/schema.js";
import { AppConfig } from "../config.js";
import { agentCall } from "../agent.js";
import { exec } from "child_process";

export default async function webhookRoutes(
  app: FastifyInstance,
  { db, cfg }: { db: Db; cfg: AppConfig }
) {
  const socket = cfg.agent.socket;

  // POST /api/webhook/build/:key — no auth, key is the secret
  app.post<{ Params: { key: string } }>("/api/webhook/build/:key", async (req, reply) => {
    const build = db.prepare("SELECT * FROM builds WHERE build_key = ?").get(req.params.key) as any;
    if (!build) return reply.status(404).send({ error: "unknown build key" });

    const runRow = db.prepare(`
      INSERT INTO build_runs (build_id, status, started_at) VALUES (?, 'running', datetime('now'))
    `).run(build.id);
    const runId = runRow.lastInsertRowid;

    // Fire-and-forget: run in background, webhook returns immediately
    reply.send({ ok: true, run_id: runId });

    runBuild(db, socket, build, runId).catch((e) => {
      db.prepare("UPDATE build_runs SET status='failed', finished_at=datetime('now'), output=? WHERE id=?")
        .run(e.message, runId);
    });
  });
}

async function runBuild(db: Db, socket: string, build: any, runId: number | bigint) {
  let fullOutput = "";
  const log = (line: string) => {
    fullOutput += line + "\n";
    db.prepare("UPDATE build_runs SET output = ? WHERE id = ?").run(fullOutput, runId);
  };

  log(`[${new Date().toISOString()}] Webhook triggered for: ${build.name}`);

  const pullRes = await agentCall(socket, "git.pull", { path: build.deploy_path }).catch(() => null);
  if (!pullRes || !pullRes.ok) {
    const cloneRes = await agentCall(socket, "git.clone", { url: build.repo_url, path: build.deploy_path });
    log(cloneRes.output ?? "");
    if (!cloneRes.ok) throw new Error(cloneRes.error ?? "clone failed");
  } else {
    log(pullRes.output ?? "");
  }

  const checkoutRes = await agentCall(socket, "git.checkout", { path: build.deploy_path, branch: build.repo_branch });
  log(checkoutRes.output ?? "");

  if (build.post_command) {
    log(`Running: ${build.post_command}`);
    await new Promise<void>((resolve) => {
      const child = exec(build.post_command, { cwd: build.deploy_path, timeout: 300_000 });
      child.stdout?.on("data", (d) => log(String(d)));
      child.stderr?.on("data", (d) => log(String(d)));
      child.on("close", () => resolve());
    });
  }

  db.prepare("UPDATE build_runs SET status='success', finished_at=datetime('now') WHERE id=?").run(runId);
  log("[DONE]");
}
