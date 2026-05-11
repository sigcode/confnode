import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { Db } from "../db/schema.js";

interface LoginBody {
  username: string;
  password: string;
}

export default async function authRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post<{ Body: LoginBody }>("/api/auth/login", {
    schema: {
      body: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.status(401).send({ error: "invalid credentials" });
    }
    req.session.userId = user.id;
    return { ok: true, username: user.username };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await req.session.destroy();
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) return reply.status(401).send({ error: "not authenticated" });
    const user = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?").get(userId) as any;
    if (!user) return reply.status(401).send({ error: "user not found" });
    return user;
  });
}

// Helper: create first admin user if table is empty
export function ensureAdminUser(db: Db, password: string) {
  const count = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
  if (count === 0) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("admin", hash);
    console.log("Created default admin user (username: admin)");
  }
}
