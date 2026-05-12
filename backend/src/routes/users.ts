import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { Db } from "../db/schema.js";

export default async function userRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // List all users
  app.get("/api/users", async (req) => {
    return db.prepare("SELECT id, username, created_at FROM users ORDER BY id").all();
  });

  // Create user
  app.post<{ Body: { username: string; password: string } }>("/api/users", {
    schema: {
      body: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 8 },
        },
      },
    },
  }, async (req, reply) => {
    const { username, password } = req.body;
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) return reply.status(409).send({ error: "username already taken" });
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
    return { ok: true, id: result.lastInsertRowid };
  });

  // Change any user's password (admin action, no current password required)
  app.put<{ Params: { id: string }; Body: { password: string } }>("/api/users/:id/password", {
    schema: {
      body: {
        type: "object",
        required: ["password"],
        properties: { password: { type: "string", minLength: 8 } },
      },
    },
  }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
    if (!user) return reply.status(404).send({ error: "user not found" });
    const hash = bcrypt.hashSync(req.body.password, 12);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
    return { ok: true };
  });

  // Delete user (can't delete yourself, can't delete last user)
  app.delete<{ Params: { id: string } }>("/api/users/:id", async (req, reply) => {
    const id = parseInt(req.params.id);
    if (id === req.session.userId) {
      return reply.status(400).send({ error: "cannot delete yourself" });
    }
    const count = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
    if (count <= 1) return reply.status(400).send({ error: "cannot delete the last user" });
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return { ok: true };
  });

  // Self: change own password (requires current password)
  app.post<{ Body: { currentPassword: string; newPassword: string } }>("/api/users/me/password", {
    schema: {
      body: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
        },
      },
    },
  }, async (req, reply) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId) as any;
    if (!user) return reply.status(404).send({ error: "user not found" });
    if (!bcrypt.compareSync(req.body.currentPassword, user.password_hash)) {
      return reply.status(401).send({ error: "current password is wrong" });
    }
    const hash = bcrypt.hashSync(req.body.newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
    return { ok: true };
  });
}
