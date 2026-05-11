import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

export type Db = Database.Database;

export function openDb(path: string): Db {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS builds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      repo_url      TEXT NOT NULL,
      repo_branch   TEXT NOT NULL DEFAULT 'main',
      deploy_path   TEXT NOT NULL,
      build_key     TEXT NOT NULL UNIQUE,
      post_command  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS build_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      build_id    INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
      status      TEXT NOT NULL DEFAULT 'pending',
      output      TEXT NOT NULL DEFAULT '',
      started_at  TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vhosts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
