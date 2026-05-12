import { FastifyInstance } from "fastify";
import { readdirSync, existsSync, readFileSync } from "fs";
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
      let serverName: string | null = null;
      let hasSSL = false;
      try {
        const content = readFileSync(join(sitesAvail, file), "utf8");
        const m = content.match(/^\s*ServerName\s+(\S+)/m);
        if (m) serverName = m[1];
        hasSSL = /SSLCertificateFile/i.test(content);
      } catch {}
      return {
        name,
        enabled: enabledFiles.has(file),
        description: metaMap[name]?.description ?? null,
        serverName,
        hasSSL,
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

    // Warn if ServerName doesn't look like a FQDN
    const snMatch = content.match(/^\s*ServerName\s+(\S+)/m);
    if (snMatch) {
      const sn = snMatch[1];
      if (!sn.includes("."))
        return reply.status(400).send({ error: `ServerName "${sn}" looks like a short hostname, not a FQDN. Use the full domain (e.g. ${sn}.example.com).` });
    }

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
    const res = await agentCall(socket, "apache.delete_vhost", { name });
    if (!res.ok) return reply.status(500).send({ error: res.error });
    db.prepare("DELETE FROM vhosts WHERE name = ?").run(name);
    return { ok: true };
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

  // Issue SSL certificate via certbot (SSE stream, GET so EventSource works)
  app.get<{ Params: { name: string }; Querystring: { domain: string } }>(
    "/api/vhosts/:name/ssl-stream",
    async (req, reply) => {
      const { domain } = req.query;
      // SSE: certbot can take a while — stream output
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.flushHeaders();

      const send = (data: string) =>
        reply.raw.write(`data: ${JSON.stringify({ line: data })}\n\n`);

      send("Starting certbot...");
      try {
        const certRes = await agentCall(socket, "certbot.issue", { domain });
        (certRes.output ?? "").split("\n").filter(Boolean).forEach(send);
        if (!certRes.ok) {
          send(`ERROR: ${certRes.error}`);
        } else {
          send("Certificate obtained. Patching vhost config...");
          // Read current vhost content, append SSL block if not already present
          const readRes = await agentCall(socket, "apache.read_vhost", { name: req.params.name });
          if (readRes.ok && readRes.output && !/SSLCertificateFile/i.test(readRes.output)) {
            const sslBlock = buildSslBlock(domain, readRes.output, sitesAvail);
            const updated = readRes.output.trimEnd() + "\n\n" + sslBlock + "\n";
            const writeRes = await agentCall(socket, "apache.write_vhost", { name: req.params.name, content: updated });
            if (!writeRes.ok) {
              send(`ERROR patching vhost: ${writeRes.error}`);
            } else {
              await agentCall(socket, "apache.reload");
              send("Vhost updated with SSL block. Apache reloaded.");
            }
          } else {
            send("SSL block already present — skipped.");
          }
        }
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

// Returns the predominant IP used in existing :443 VirtualHost directives.
// Needed so new SSL blocks join the same NameVirtualHost group as existing ones.
function detectSslIp(sitesAvail: string): string {
  const counts: Record<string, number> = {};
  try {
    const files = readdirSync(sitesAvail).filter((f) => f.endsWith(".conf"));
    for (const f of files) {
      try {
        const c = readFileSync(join(sitesAvail, f), "utf8");
        for (const m of c.matchAll(/<VirtualHost\s+([^:>]+):443>/gi)) {
          const ip = m[1].trim();
          counts[ip] = (counts[ip] ?? 0) + 1;
        }
      } catch {}
    }
  } catch {}
  // Pick the most common non-wildcard IP, fall back to "*"
  const ips = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const specific = ips.find(([ip]) => ip !== "*");
  return specific ? specific[0] : (ips[0]?.[0] ?? "*");
}

// Builds an SSL VirtualHost block to append after a successful certbot run.
// Detects whether the existing config is a reverse proxy or DocumentRoot vhost
// and mirrors the relevant directives under :443.
function buildSslBlock(domain: string, existingContent: string, sitesAvail: string): string {
  const ip = detectSslIp(sitesAvail);

  const certBase = `/etc/letsencrypt/live/${domain}`;
  const isProxy = /ProxyPass\s+\/\s+http/i.test(existingContent);

  if (isProxy) {
    const ppMatch = existingContent.match(/ProxyPass\s+\/\s+(\S+)/i);
    const pprMatch = existingContent.match(/ProxyPassReverse\s+\/\s+(\S+)/i);
    const target = ppMatch?.[1] ?? "http://127.0.0.1:3000/";
    const targetReverse = pprMatch?.[1] ?? target;
    return `<VirtualHost ${ip}:443>
    ServerName ${domain}

    SSLEngine on
    SSLCertificateFile      ${certBase}/fullchain.pem
    SSLCertificateKeyFile   ${certBase}/privkey.pem
    Include                 /etc/letsencrypt/options-ssl-apache.conf

    ProxyPreserveHost On
    ProxyPass        / ${target}
    ProxyPassReverse / ${targetReverse}

    ErrorLog  \${APACHE_LOG_DIR}/${domain}-ssl-error.log
    CustomLog \${APACHE_LOG_DIR}/${domain}-ssl-access.log combined
</VirtualHost>`;
  }

  // DocumentRoot vhost
  const drMatch = existingContent.match(/DocumentRoot\s+(\S+)/i);
  const docRoot = drMatch?.[1] ?? `/var/www/${domain}`;
  return `<VirtualHost ${ip}:443>
    ServerName ${domain}
    DocumentRoot ${docRoot}

    SSLEngine on
    SSLCertificateFile      ${certBase}/fullchain.pem
    SSLCertificateKeyFile   ${certBase}/privkey.pem
    Include                 /etc/letsencrypt/options-ssl-apache.conf

    <Directory ${docRoot}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog  \${APACHE_LOG_DIR}/${domain}-ssl-error.log
    CustomLog \${APACHE_LOG_DIR}/${domain}-ssl-access.log combined
</VirtualHost>`;
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

    DirectoryIndex index.php index.html

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
