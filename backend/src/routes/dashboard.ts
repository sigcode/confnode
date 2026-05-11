import { FastifyInstance } from "fastify";
import { agentCall } from "../agent.js";
import { AppConfig } from "../config.js";

type ServiceAction = "start" | "stop" | "restart" | "reload";

export default async function dashboardRoutes(
  app: FastifyInstance,
  { cfg }: { cfg: AppConfig }
) {
  const socket = cfg.agent.socket;

  app.get("/api/dashboard/status", async () => {
    const [apache, mysql, ...phpFpm] = await Promise.all([
      agentCall(socket, "apache.configtest").then((r) => ({
        name: "apache2",
        active: r.ok,
        output: r.output ?? r.error,
      })).catch(() => ({ name: "apache2", active: false, output: "unreachable" })),

      agentCall(socket, "mysql.status").then((r) => ({
        name: "mysql",
        active: (r.output ?? "").trim() === "active",
        output: r.output ?? r.error,
      })).catch(() => ({ name: "mysql", active: false, output: "unreachable" })),

      ...cfg.php.versions.map((v) =>
        agentCall(socket, "phpfpm.status", { version: v })
          .then((r) => ({
            name: `php${v}-fpm`,
            active: (r.output ?? "").trim() === "active",
            output: r.output ?? r.error,
          }))
          .catch(() => ({ name: `php${v}-fpm`, active: false, output: "unreachable" }))
      ),
    ]);

    return { services: [apache, mysql, ...phpFpm] };
  });

  app.post<{ Body: { service: string; action: ServiceAction } }>(
    "/api/dashboard/control",
    async (req, reply) => {
      const { service, action } = req.body;
      const allowed = ["start", "stop", "restart", "reload"];
      if (!allowed.includes(action))
        return reply.status(400).send({ error: "invalid action" });

      let res;
      if (service === "apache2") {
        res = await agentCall(socket, `apache.${action}`);
      } else if (service === "mysql") {
        res = await agentCall(socket, `mysql.${action}`);
      } else if (service.startsWith("php") && service.endsWith("-fpm")) {
        const version = service.replace("php", "").replace("-fpm", "");
        if (!cfg.php.versions.includes(version))
          return reply.status(400).send({ error: "unknown PHP version" });
        res = await agentCall(socket, "phpfpm.restart", { version });
      } else {
        return reply.status(400).send({ error: "unknown service" });
      }

      if (!res.ok) return reply.status(500).send({ error: res.error });
      return { ok: true, output: res.output };
    }
  );
}
