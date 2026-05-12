import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { agentCall } from "../agent.js";
import { Db } from "../db/schema.js";
import { AppConfig } from "../config.js";
import { getGitSSHKey, getGitTimeoutMs } from "./config.js";
import { exec } from "child_process";

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

  // Trigger a build run — streams output via SSE
  app.post<{ Params: { id: string } }>("/api/builds/:id/run", async (req, reply) => {
    const build = db.prepare("SELECT * FROM builds WHERE id = ?").get(req.params.id) as any;
    if (!build) return reply.status(404).send({ error: "not found" });

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.flushHeaders();

    const runRow = db.prepare(`
      INSERT INTO build_runs (build_id, status, started_at) VALUES (?, 'running', datetime('now'))
    `).run(build.id);
    const runId = runRow.lastInsertRowid;

    let fullOutput = "";
    const send = (line: string) => {
      fullOutput += line + "\n";
      db.prepare("UPDATE build_runs SET output = ? WHERE id = ?").run(fullOutput, runId);
      reply.raw.write(`data: ${JSON.stringify({ line })}\n\n`);
    };

    try {
      send(`[${new Date().toISOString()}] Starting build: ${build.name}`);

      // git pull or clone
      const exists = await agentCall(socket, "systemd.status", { unit: "apache2" })
        .then(() => true).catch(() => false); // just test agent is alive

      const sshKey = getGitSSHKey(db);
      const GIT_TIMEOUT = getGitTimeoutMs(db);

      // Check if deploy_path exists → pull, else clone
      const gitAction = await agentCall(socket, "git.pull", { path: build.deploy_path, ssh_key: sshKey }, GIT_TIMEOUT)
        .catch(() => null);

      if (!gitAction || !gitAction.ok) {
        send("Directory not found or git pull failed, cloning...");
        const cloneRes = await agentCall(socket, "git.clone", {
          url: build.repo_url,
          path: build.deploy_path,
          ssh_key: sshKey,
        }, GIT_TIMEOUT);
        (cloneRes.output ?? "").split("\n").forEach(send);
        if (!cloneRes.ok) throw new Error(cloneRes.error ?? "clone failed");
      } else {
        (gitAction.output ?? "").split("\n").forEach(send);
      }

      // Checkout branch
      const checkoutRes = await agentCall(socket, "git.checkout", {
        path: build.deploy_path,
        branch: build.repo_branch,
        ssh_key: sshKey,
      }, GIT_TIMEOUT);
      (checkoutRes.output ?? "").split("\n").forEach(send);

      // Submodules
      if (build.has_submodules) {
        send("Updating submodules...");
        const subRes = await agentCall(socket, "git.submodule_update", {
          path: build.deploy_path,
          ssh_key: sshKey,
        }, GIT_TIMEOUT);
        (subRes.output ?? "").split("\n").forEach(send);
        if (!subRes.ok) throw new Error(subRes.error ?? "submodule update failed");
      }

      // Post command (runs directly in shell as web user — no privileged ops here)
      if (build.post_command) {
        send(`Running post command: ${build.post_command}`);
        await runPostCommand(build.post_command, build.deploy_path, send);
      }

      db.prepare("UPDATE build_runs SET status='success', finished_at=datetime('now') WHERE id=?").run(runId);
      send("[DONE] Build successful.");
      reply.raw.write(`data: ${JSON.stringify({ status: "success" })}\n\n`);
    } catch (e: any) {
      db.prepare("UPDATE build_runs SET status='failed', finished_at=datetime('now') WHERE id=?").run(runId);
      send(`[ERROR] ${e.message}`);
      reply.raw.write(`data: ${JSON.stringify({ status: "failed" })}\n\n`);
    }

    reply.raw.end();
  });
}

function runPostCommand(cmd: string, cwd: string, send: (l: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const child = exec(cmd, { cwd, timeout: 300_000 });
    child.stdout?.on("data", (d) => String(d).split("\n").forEach(send));
    child.stderr?.on("data", (d) => String(d).split("\n").forEach(send));
    child.on("close", () => resolve());
  });
}
