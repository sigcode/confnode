import { readFileSync } from "fs";
import yaml from "js-yaml";

export interface AppConfig {
  server: {
    port: number;
    secret: string;
    frontend_dist?: string;
  };
  apache: {
    mode: "debian" | "arch";
    sites_available: string;
    sites_enabled: string;
    default_webroot: string;
  };
  php: {
    versions: string[];
    default: string;
    fpm_units?: Record<string, string>;
  };
  certbot: {
    email: string;
  };
  database: {
    path: string;
  };
  agent: {
    socket: string;
  };
}

const DEFAULTS: AppConfig = {
  server: { port: 3001, secret: "change-me-in-production" },
  apache: {
    mode: "debian",
    sites_available: "/etc/apache2/sites-available",
    sites_enabled: "/etc/apache2/sites-enabled",
    default_webroot: "/var/www",
  },
  php: { versions: ["8.1", "8.3", "8.4"], default: "8.4" },
  certbot: { email: "" },
  database: { path: "/var/lib/configurator/db.sqlite" },
  agent: { socket: "/run/configurator-agent.sock" },
};

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object") {
      (result as any)[key] = deepMerge(tv, sv as any);
    } else if (sv !== undefined) {
      (result as any)[key] = sv;
    }
  }
  return result;
}

export function loadConfig(path: string): AppConfig {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = yaml.load(raw) as Partial<AppConfig>;
    return deepMerge(DEFAULTS, parsed);
  } catch {
    console.warn(`Config file not found at ${path}, using defaults`);
    return DEFAULTS;
  }
}
