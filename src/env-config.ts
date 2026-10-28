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

  /** Hub data directory (auto-created). Default: ~/.agenthub */
  get HUB_HOME(): string {
    const dir = resolveHome(Bun.env.HUB_HOME ?? "~/.agenthub");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * SQLite file holding rooms, members and message history. Not `hub.db`:
   * that name belongs to the pre-1.0 schema (its own `messages` table), which
   * this one must not migrate on top of.
   */
  get HUB_DB_PATH(): string {
    const raw = Bun.env.HUB_DB_PATH;
    return raw ? resolveHome(raw) : join(this.HUB_HOME, "relay.db");
  }

  /**
   * Interface the dashboard binds to. Defaults to loopback: anything that can
   * reach the API can type into your Claude sessions.
   */
  get SERVER_HOST(): string {
    return Bun.env.SERVER_HOST ?? "127.0.0.1";
  }

  /**
   * Extra hostnames the dashboard may be reached by (comma-separated), e.g. a
   * Tailscale MagicDNS name. Lowercased, ports ignored.
   */
  get HUB_ALLOWED_HOSTS(): string[] {
    return (Bun.env.HUB_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/:\d+$/, ""))
      .filter(Boolean);
  }

  /** Dashboard HTTP port */
  get SERVER_PORT(): number {
    const port = Bun.env.SERVER_PORT;
    return port ? parseInt(port, 10) : 3000;
  }

  /** Base URL clients (TUI, CLI) use to reach the server. */
  get SERVER_URL(): string {
    const host = this.SERVER_HOST;
    // A wildcard bind isn't an address to dial; local clients use loopback.
    const dial = host === "0.0.0.0" || host === "::" || host === "[::]" ? "127.0.0.1" : host;
    return Bun.env.AGENTHUB_URL ?? `http://${dial}:${this.SERVER_PORT}`;
  }

  /** Claude Code config dir. Honours CLAUDE_CONFIG_DIR like Claude Code itself. */
  get CLAUDE_CONFIG_DIR(): string {
    return resolveHome(Bun.env.CLAUDE_CONFIG_DIR ?? "~/.claude");
  }

  /** Where each Claude Code session publishes `<pid>.json` + its messaging key. */
  get SESSIONS_DIR(): string {
    return join(this.CLAUDE_CONFIG_DIR, "sessions");
  }

  /**
   * Override for the hub socket directory. Unset = infer from live sessions'
   * socket paths (see `resolveHubSocketPath`).
   */
  get HUB_SOCKET_DIR(): string | undefined {
    const raw = Bun.env.HUB_SOCKET_DIR;
    return raw ? resolveHome(raw) : undefined;
  }

  /** Claude Code executable used for spawning background sessions. */
  get CLAUDE_BIN(): string {
    return Bun.env.CLAUDE_BIN ?? "claude";
  }

  /** Current environment */
  get NODE_ENV(): string {
    return Bun.env.NODE_ENV ?? "development";
  }

  get isDevelopment(): boolean {
    return this.NODE_ENV === "development";
  }
}

export const envConfig = EnvConfig.getInstance();
