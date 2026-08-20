import { EventEmitter } from "events";
import { exec } from "child_process";
import { Db } from "./db/schema.js";
import { AppConfig } from "./config.js";
import { agentCall } from "./agent.js";
import { getGitSSHKey, getGitTimeoutMs } from "./routes/config.js";

interface QueueItem {
  runId: number;
  build: any;
}

export async function executeBuild(
  db: Db,
  socket: string,
  cfg: AppConfig,
  build: any,
  runId: number | bigint,
  onLine: (line: string) => void
): Promise<"success" | "failed"> {
  let fullOutput = "";
  const log = (line: string) => {
    fullOutput += line + "\n";
    db.prepare("UPDATE build_runs SET output = ? WHERE id = ?").run(fullOutput, runId);
    onLine(line);
  };

  try {
    log(`[${new Date().toISOString()}] Starting build: ${build.name}`);

    const sshKey = getGitSSHKey(db);
    const GIT_TIMEOUT = getGitTimeoutMs(db);

    // Clone vs. pull wird anhand des tatsächlichen Zustands des Deploy-Pfads
    // entschieden (git.exists prüft "<path>/.git"), NICHT anhand von "hat
    // pull geklappt" — ein pull kann aus vielen Gründen scheitern, ohne dass
    // das etwas mit "Repo existiert noch nicht" zu tun hat (fehlendes
    // Branch-Tracking, gits safe.directory-Ownership-Check, Timeout, ...).
    // Vorher führte genau das dazu, dass ein zweiter Build auf demselben
    // deploy_path bei jedem pull-Fehler blind einen clone versuchte und mit
    // "destination path ... already exists and is not an empty directory"
    // krachte.
    const existsRes = await agentCall(socket, "git.exists", { path: build.deploy_path }, GIT_TIMEOUT);
    const repoExists = existsRes.ok && existsRes.output?.trim() === "true";

    if (!repoExists) {
      log("No existing repo at deploy path, cloning...");
      const cloneRes = await agentCall(socket, "git.clone", {
        url: build.repo_url,
        path: build.deploy_path,
        ssh_key: sshKey,
      }, GIT_TIMEOUT);
      (cloneRes.output ?? "").split("\n").forEach(log);
      if (!cloneRes.ok) throw new Error(cloneRes.error ?? "clone failed");
    } else {
      log("Existing repo found, pulling...");
      const gitAction = await agentCall(socket, "git.pull", { path: build.deploy_path, ssh_key: sshKey }, GIT_TIMEOUT);
      (gitAction.output ?? "").split("\n").forEach(log);
      // Fehler nicht mehr schlucken: Build schlägt jetzt mit dem echten
      // pull-Fehlertext (Tracking, Ownership, ...) fehl, statt ihn zu
      // verstecken und stattdessen blind zu clonen.
      if (!gitAction.ok) throw new Error(gitAction.error ?? "git pull failed");
    }

    const checkoutRes = await agentCall(socket, "git.checkout", {
      path: build.deploy_path,
      branch: build.repo_branch,
      ssh_key: sshKey,
    }, GIT_TIMEOUT);
    (checkoutRes.output ?? "").split("\n").forEach(log);

    if (build.has_submodules) {
      log("Updating submodules...");
      const subRes = await agentCall(socket, "git.submodule_update", {
        path: build.deploy_path,
        ssh_key: sshKey,
      }, GIT_TIMEOUT);
      (subRes.output ?? "").split("\n").forEach(log);
      if (!subRes.ok) throw new Error(subRes.error ?? "submodule update failed");
    }

    if (build.post_command) {
      log(`Running post command: ${build.post_command}`);
      await runPostCommand(build.post_command, build.deploy_path, log);
    }

    db.prepare("UPDATE build_runs SET status='success', finished_at=datetime('now') WHERE id=?").run(runId);
    log("[DONE] Build successful.");
    return "success";
  } catch (e: any) {
    db.prepare("UPDATE build_runs SET status='failed', finished_at=datetime('now') WHERE id=?").run(runId);
    log(`[ERROR] ${e.message}`);
    return "failed";
  }
}

function runPostCommand(cmd: string, cwd: string, send: (l: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const child = exec(cmd, { cwd, timeout: 300_000 });
    child.stdout?.on("data", (d) => String(d).split("\n").forEach(send));
    child.stderr?.on("data", (d) => String(d).split("\n").forEach(send));
    child.on("close", () => resolve());
  });
}

class BuildQueue {
  private queue: QueueItem[] = [];
  private running = false;
  private emitters = new Map<number, EventEmitter>();
  private db: Db | null = null;
  private socket = "";
  private cfg: AppConfig | null = null;

  getEmitter(runId: number): EventEmitter {
    if (!this.emitters.has(runId)) {
      this.emitters.set(runId, new EventEmitter());
    }
    return this.emitters.get(runId)!;
  }

  enqueue(db: Db, build: any): { runId: number; position: number } {
    const row = db.prepare(
      "INSERT INTO build_runs (build_id, status, queued_at) VALUES (?, 'queued', datetime('now'))"
    ).run(build.id);
    const runId = Number(row.lastInsertRowid);
    const position = this.queue.length + (this.running ? 1 : 0);
    this.queue.push({ runId, build });
    setImmediate(() => this.processNext());
    return { runId, position };
  }

  loadFromDb(db: Db, socket: string, cfg: AppConfig): void {
    this.db = db;
    this.socket = socket;
    this.cfg = cfg;

    // Mark any interrupted 'running' as 'failed'
    db.prepare(
      "UPDATE build_runs SET status='failed', finished_at=datetime('now'), output = output || '\n[interrupted by server restart]' WHERE status='running'"
    ).run();

    // Re-queue persisted 'queued' rows
    const queued = db.prepare(`
      SELECT br.id as run_id, b.*
      FROM build_runs br
      JOIN builds b ON b.id = br.build_id
      WHERE br.status = 'queued'
      ORDER BY br.id ASC
    `).all() as any[];

    for (const row of queued) {
      const { run_id, ...build } = row;
      this.queue.push({ runId: run_id, build });
    }

    if (this.queue.length > 0) {
      setImmediate(() => this.processNext());
    }
  }

  private async processNext(): Promise<void> {
    if (this.running || !this.queue.length || !this.db || !this.cfg) return;
    this.running = true;

    const item = this.queue.shift()!;
    const { runId, build } = item;
    const emitter = this.getEmitter(runId);

    this.db.prepare(
      "UPDATE build_runs SET status='running', started_at=datetime('now') WHERE id=?"
    ).run(runId);

    // Signal any SSE clients waiting on 'queued' state
    emitter.emit("started");

    const status = await executeBuild(this.db, this.socket, this.cfg, build, runId, (line) => {
      emitter.emit("line", line);
    });

    emitter.emit("status", status);
    // Clean up emitter after a delay so SSE clients can receive the final event
    setTimeout(() => this.emitters.delete(runId), 60_000);

    this.running = false;
    this.processNext();
  }
}

export const buildQueue = new BuildQueue();
