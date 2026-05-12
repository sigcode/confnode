import { FastifyInstance } from "fastify";
import { agentCall } from "../agent.js";
import { AppConfig } from "../config.js";

export default async function apacheRoutes(
  app: FastifyInstance,
  { cfg }: { cfg: AppConfig }
) {
  const socket = cfg.agent.socket;

  app.post("/api/apache/configtest", async (_req, reply) => {
    const res = await agentCall(socket, "apache.configtest");
    return { ok: res.ok, output: res.output ?? res.error ?? "" };
  });

  app.post("/api/apache/reload", async (_req, reply) => {
    const res = await agentCall(socket, "apache.reload");
    if (!res.ok) return reply.status(500).send({ error: res.error });
    return { ok: true };
  });
}
