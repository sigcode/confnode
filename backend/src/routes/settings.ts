import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { Db } from "../db/schema.js";

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export default async function settingsRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post<{ Body: ChangePasswordBody }>("/api/settings/password", {
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
    const userId = req.session.userId;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!user) return reply.status(404).send({ error: "user not found" });

    if (!bcrypt.compareSync(req.body.currentPassword, user.password_hash)) {
      return reply.status(401).send({ error: "current password is wrong" });
    }

    const hash = bcrypt.hashSync(req.body.newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
    return { ok: true };
  });
}
