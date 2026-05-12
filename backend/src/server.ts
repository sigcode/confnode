import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

import { loadConfig } from "./config.js";
import { openDb } from "./db/schema.js";
import authRoutes, { ensureAdminUser } from "./routes/auth.js";
import vhostRoutes from "./routes/vhosts.js";
import buildRoutes from "./routes/builds.js";
import dashboardRoutes from "./routes/dashboard.js";
import apacheRoutes from "./routes/apache.js";
import webhookRoutes from "./routes/webhook.js";
import userRoutes from "./routes/users.js";
import configRoutes from "./routes/config.js";

const CONFIG_PATH = process.env.CONFIG_PATH ?? "/etc/configurator/config.yaml";
const cfg = loadConfig(CONFIG_PATH);

const db = openDb(cfg.database.path);
ensureAdminUser(db, process.env.ADMIN_PASSWORD ?? "changeme");

const app = Fastify({ logger: true });

await app.register(fastifyCookie);
await app.register(fastifySession, {
  secret: cfg.server.secret,
  cookie: { secure: false, httpOnly: true, maxAge: 86400000 * 7 },
  saveUninitialized: false,
});

// Auth middleware for /api routes (except auth + webhook)
app.addHook("onRequest", async (req, reply) => {
  const pub = req.url.startsWith("/api/auth/") || req.url.startsWith("/api/webhook/");
  if (!pub && req.url.startsWith("/api/")) {
    const userId = req.session.userId;
    if (!userId) return reply.status(401).send({ error: "not authenticated" });
  }
});

// Register routes
await app.register(authRoutes, { db });
await app.register(vhostRoutes, { db, cfg });
await app.register(buildRoutes, { db, cfg });
await app.register(dashboardRoutes, { cfg });
await app.register(apacheRoutes, { cfg });
await app.register(webhookRoutes, { db, cfg });
await app.register(userRoutes, { db });
await app.register(configRoutes, { db });

// Serve built frontend in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDist = cfg.server.frontend_dist ?? join(__dirname, "../../frontend/dist");
if (existsSync(frontendDist)) {
  await app.register(fastifyStatic, { root: frontendDist, prefix: "/" });
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile("index.html");
  });
}

const port = cfg.server.port;
await app.listen({ port, host: "0.0.0.0" });
console.log(`configurator-backend listening on port ${port}`);
