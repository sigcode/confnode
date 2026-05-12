import { FastifyInstance } from "fastify";
import { Db } from "../db/schema.js";
import { AppConfig } from "../config.js";

// Settings stored in DB (user-editable via UI)
const KNOWN_KEYS = ["git.ssh_key", "git.timeout_minutes"] as const;
type SettingKey = typeof KNOWN_KEYS[number];

function getSetting(db: Db, key: SettingKey): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return row?.value ?? null;
}

function setSetting(db: Db, key: SettingKey, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

function deleteSetting(db: Db, key: SettingKey) {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getGitSSHKey(db: Db): string {
  return getSetting(db, "git.ssh_key") ?? "";
}

export function getGitTimeoutMs(db: Db): number {
  const v = getSetting(db, "git.timeout_minutes");
  if (v) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) return n * 60_000;
  }
  return 600_000; // 10 min default
}

export default async function configRoutes(app: FastifyInstance, { db, cfg }: { db: Db; cfg: AppConfig }) {
  app.get("/api/config", async () => {
    return {
      git: {
        ssh_key: getSetting(db, "git.ssh_key") ?? "",
        timeout_minutes: getSetting(db, "git.timeout_minutes") ?? "",
      },
      php: {
        versions: cfg.php.versions,
        default: cfg.php.default,
      },
    };
  });

  app.put<{ Body: { git?: { ssh_key?: string; timeout_minutes?: string } } }>("/api/config", async (req) => {
    const { git } = req.body;
    if (git !== undefined) {
      if (git.ssh_key !== undefined) {
        if (git.ssh_key.trim() === "") {
          deleteSetting(db, "git.ssh_key");
        } else {
          setSetting(db, "git.ssh_key", git.ssh_key.trim());
        }
      }
      if (git.timeout_minutes !== undefined) {
        if (git.timeout_minutes.trim() === "") {
          deleteSetting(db, "git.timeout_minutes");
        } else {
          setSetting(db, "git.timeout_minutes", git.timeout_minutes.trim());
        }
      }
    }
    return { ok: true };
  });
}
