import { FastifyInstance } from "fastify";
import { Db } from "../db/schema.js";

// Settings stored in DB (user-editable via UI)
const KNOWN_KEYS = ["git.ssh_key"] as const;
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

export default async function configRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/api/config", async () => {
    return {
      git: {
        ssh_key: getSetting(db, "git.ssh_key") ?? "",
      },
    };
  });

  app.put<{ Body: { git?: { ssh_key?: string } } }>("/api/config", async (req) => {
    const { git } = req.body;
    if (git !== undefined) {
      if (git.ssh_key !== undefined) {
        if (git.ssh_key.trim() === "") {
          deleteSetting(db, "git.ssh_key");
        } else {
          setSetting(db, "git.ssh_key", git.ssh_key.trim());
        }
      }
    }
    return { ok: true };
  });
}
