import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve ~ to the actual home directory */
function resolveHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(2));
  }
  return p;
}

/**
 * Singleton class for typed environment configuration.
 * Reads from Bun.env (loaded automatically from .env).
 */
class EnvConfig {
  private static instance: EnvConfig;

  private constructor() {}

  /** Returns the singleton instance */
  static getInstance(): EnvConfig {
    if (!EnvConfig.instance) {
      EnvConfig.instance = new EnvConfig();
    }
    return EnvConfig.instance;
  }

  /**
   * Path to the shared SQLite hub database.
   * Defaults to ~/.agenthub/hub.db so the same DB is shared across all
   * projects without needing to set HUB_DB_PATH every time.
   * Auto-creates the ~/.agenthub/ directory if it doesn't exist.
   */
  get HUB_DB_PATH(): string {
    const raw = Bun.env.HUB_DB_PATH ?? "~/.agenthub/hub.db";
    const resolved = resolveHome(raw);

    // Ensure the parent directory exists
    const dir = resolved.substring(0, resolved.lastIndexOf("/"));
    if (dir) mkdirSync(dir, { recursive: true });

    return resolved;
  }

  /** Dashboard HTTP port */
  get SERVER_PORT(): number {
    const port = Bun.env.SERVER_PORT;
    return port ? parseInt(port, 10) : 3000;
  }

  /** Current environment */
  get NODE_ENV(): string {
    return Bun.env.NODE_ENV ?? "development";
  }

  /** Agent ID for this process (set per-agent terminal) */
  get AGENT_ID(): string | undefined {
    return Bun.env.AGENT_ID;
  }

  get isDevelopment(): boolean {
    return this.NODE_ENV === "development";
  }
}

export const envConfig = EnvConfig.getInstance();
