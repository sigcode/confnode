import { FastifyInstance } from "fastify";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { Db } from "../db/schema.js";
import { agentCall } from "../agent.js";
import { AppConfig } from "../config.js";

interface VhostBody {
  name?: string;
  content?: string;
  description?: string;
  phpVersion?: string;
}

export default async function vhostRoutes(
  app: FastifyInstance,
  { db, cfg }: { db: Db; cfg: AppConfig }
) {
  const socket = cfg.agent.socket;
  const sitesAvail = cfg.apache.sites_available;
  const sitesEnabled = cfg.apache.sites_enabled;

  // List all vhosts from filesystem + DB metadata
  app.get("/api/vhosts", async () => {
    const files = existsSync(sitesAvail)
      ? readdirSync(sitesAvail).filter((f) => f.endsWith(".conf"))
      : [];

    const enabledFiles = existsSync(sitesEnabled)
      ? new Set(readdirSync(sitesEnabled).filter((f) => f.endsWith(".conf")))
      : new Set<string>();

    const dbRows = db.prepare("SELECT * FROM vhosts").all() as any[];
    const metaMap = Object.fromEntries(dbRows.map((r) => [r.name, r]));

    return files.map((file) => {
      const name = file.replace(/\.conf$/, "");
      return {
        name,
        enabled: enabledFiles.has(file),
        description: metaMap[name]?.description ?? null,
      };
    });
  });

  // Read a single vhost config
  app.get<{ Params: { name: string } }>("/api/vhosts/:name", async (req, reply) => {
    const { name } = req.params;
    const res = await agentCall(socket, "apache.read_vhost", { name });
    if (!res.ok) return reply.status(400).send({ error: res.error });
    const meta = db.prepare("SELECT * FROM vhosts WHERE name = ?").get(name) as any;
    return { name, content: res.output, description: meta?.description ?? null };
  });

  // Create or update a vhost config (expert mode: raw content)
  app.put<{ Params: { name: string }; Body: VhostBody }>("/api/vhosts/:name", async (req, reply) => {
    const { name } = req.params;
    const { content, description } = req.body;
    if (!content) return reply.status(400).send({ error: "content required" });

    const res = await agentCall(socket, "apache.write_vhost", { name, content });
    if (!res.ok) return reply.status(400).send({ error: res.error });

    db.prepare(`
      INSERT INTO vhosts (name, description) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET description = excluded.description
    `).run(name, description ?? null);

    return { ok: true };
  });

  // Delete vhost (disable + remove file)
  app.delete<{ Params: { name: string } }>("/api/vhosts/:name", async (req, reply) => {
    const { name } = req.params;
    await agentCall(socket, "apache.disable_site", { name });
    // Remove the file via write with empty — agent will reject empty,
    // so we use a dedicated approach: overwrite with marker then let user decide.
    // For safety, we just disable and remove from DB; file stays on disk.
    db.prepare("DELETE FROM vhosts WHERE name = ?").run(name);
    return { ok: true, note: "disabled and removed from DB; .conf file preserved on disk" };
  });

  // Enable / disable
  app.post<{ Params: { name: string }; Body: { enabled: boolean } }>(
    "/api/vhosts/:name/toggle",
    async (req, reply) => {
      const { name } = req.params;
      const { enabled } = req.body;
      const cmd = enabled ? "apache.enable_site" : "apache.disable_site";
      const res = await agentCall(socket, cmd, { name });
      if (!res.ok) return reply.status(400).send({ error: res.error });
      // Auto-reload apache
      await agentCall(socket, "apache.reload");
      return { ok: true };
    }
  );

  // Change PHP version (rewrites FPM socket in config)
  app.post<{ Params: { name: string }; Body: { version: string } }>(
    "/api/vhosts/:name/php-version",
    async (req, reply) => {
      const { name } = req.params;
      const { version } = req.body;

      const readRes = await agentCall(socket, "apache.read_vhost", { name });
      if (!readRes.ok) return reply.status(400).send({ error: readRes.error });

      const updated = (readRes.output ?? "").replace(
        /php\d+\.\d+-fpm\.sock/g,
        `php${version}-fpm.sock`
      );
      const writeRes = await agentCall(socket, "apache.write_vhost", { name, content: updated });
      if (!writeRes.ok) return reply.status(400).send({ error: writeRes.error });

      await agentCall(socket, "apache.reload");
      return { ok: true };
    }
  );

  // Issue SSL certificate via certbot
  app.post<{ Params: { name: string }; Body: { domain: string } }>(
    "/api/vhosts/:name/ssl",
    async (req, reply) => {
      const { domain } = req.body;
      // SSE: certbot can take a while — stream output
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.flushHeaders();

      const send = (data: string) =>
        reply.raw.write(`data: ${JSON.stringify({ line: data })}\n\n`);

      send("Starting certbot...");
      try {
        const res = await agentCall(socket, "certbot.issue", { domain });
        (res.output ?? "").split("\n").forEach(send);
        if (!res.ok) send(`ERROR: ${res.error}`);
        else send("SSL certificate issued successfully.");
      } catch (e: any) {
        send(`ERROR: ${e.message}`);
      }
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
    }
  );

  // Generate config from wizard (simple mode)
  app.post<{ Body: { domain: string; path: string; phpVersion: string; description?: string } }>(
    "/api/vhosts/wizard",
    async (req, reply) => {
      const { domain, path, phpVersion, description } = req.body;
      if (!domain || !path || !phpVersion)
        return reply.status(400).send({ error: "domain, path and phpVersion required" });

      const name = domain.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const content = generateVhostConfig(domain, path, phpVersion, cfg.apache.mode, cfg.php.fpm_units);

      const res = await agentCall(socket, "apache.write_vhost", { name, content });
      if (!res.ok) return reply.status(400).send({ error: res.error });

      db.prepare(`
        INSERT INTO vhosts (name, description) VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET description = excluded.description
      `).run(name, description ?? null);

      return { ok: true, name };
    }
  );
}

function phpFpmSocket(version: string, apacheMode: string, fpmUnits?: Record<string, string>): string {
  if (apacheMode !== "arch") return `/run/php/php${version}-fpm.sock`;
  // On Arch, use fpm_units override if present, otherwise strip dot from version
  const unit = fpmUnits?.[version] ?? `php${version.replace(".", "")}-fpm`;
  return `/run/${unit}/${unit}.sock`;
}

function generateVhostConfig(domain: string, path: string, phpVersion: string, apacheMode: string, fpmUnits?: Record<string, string>): string {
  const isArch = apacheMode === "arch";
  const fpmSocket = phpFpmSocket(phpVersion, apacheMode, fpmUnits);
  const logDir = isArch ? "/var/log/httpd" : "/var/log/apache2";

  return `<VirtualHost *:80>
    ServerName ${domain}
    DocumentRoot ${path}

    <FilesMatch \\.php$>
        SetHandler "proxy:unix:${fpmSocket}|fcgi://localhost"
    </FilesMatch>

    <Directory ${path}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${logDir}/${domain}-error.log
    CustomLog ${logDir}/${domain}-access.log combined
</VirtualHost>
`;
}
