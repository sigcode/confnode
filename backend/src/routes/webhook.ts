import { FastifyInstance } from "fastify";
import { Db } from "../db/schema.js";
import { AppConfig } from "../config.js";
import { buildQueue } from "../buildQueue.js";

export default async function webhookRoutes(
  app: FastifyInstance,
  { db }: { db: Db; cfg: AppConfig }
) {
  // POST /api/webhook/build/:key — no auth, key is the secret
  app.post<{ Params: { key: string } }>("/api/webhook/build/:key", async (req, reply) => {
    const build = db.prepare("SELECT * FROM builds WHERE build_key = ?").get(req.params.key) as any;
    if (!build) return reply.status(404).send({ error: "unknown build key" });
    const { runId, position } = buildQueue.enqueue(db, build);
    return { ok: true, run_id: runId, position };
  });
}
