import { parseArgs } from "node:util";
import { PERMISSION_MODES, type PermissionMode } from "./core/permission-modes";
import { ValidationError } from "./errors/custom-errors";

// ─── Result type ─────────────────────────────────────────────────────────────

export type CliResult =
  | { type: "help" }
  | { type: "version" }
  | { type: "server"; port?: number }
  | { type: "tui" }
  | { type: "ls"; json: boolean }
  | { type: "send"; session: string; body: string }
  | {
      type: "spawn";
      cwd: string;
      name: string;
      prompt?: string;
      permissionMode?: PermissionMode;
      model?: string;
      roomId?: string;
    }
  | { type: "rooms" }
  | { type: "room:create"; name: string; topic?: string; context?: string }
  | { type: "room:add"; roomId: string; session: string; alias?: string }
  | { type: "room:post"; roomId: string; body: string };

// ─── Usage ───────────────────────────────────────────────────────────────────

/** ANSI colour helper — no-ops when stdout is not a TTY. */
function color(cssColor: string): string {
  if (!process.stdout.isTTY) return "";
  return Bun.color(cssColor, "ansi") ?? "";
}

const RESET = process.stdout.isTTY ? "\x1b[0m" : "";
const BOLD = process.stdout.isTTY ? "\x1b[1m" : "";

export function printUsage(): void {
  const cyan = color("cyan");
  const gray = color("gray");
  console.log(`
${BOLD}agenthub${RESET} — relay hub & command center for live Claude Code sessions

${BOLD}Usage:${RESET}
  ${cyan}agenthub server${RESET} [--port N]          Start the hub + web dashboard
  ${cyan}agenthub tui${RESET}                        Terminal dashboard (starts the server if needed)
  ${cyan}agenthub ls${RESET} [--json]                List live Claude Code sessions
  ${cyan}agenthub send${RESET} <session> <message>   Message a session (pid, name, or session id)
  ${cyan}agenthub spawn${RESET} --cwd <dir> --name <name> [--prompt <text>]
                 [--mode <${PERMISSION_MODES.join("|")}>]
                 [--model <model>] [--room <room>]
                                      Start a background Claude session (claude --bg)
  ${cyan}agenthub rooms${RESET}                      List rooms
  ${cyan}agenthub room:create${RESET} <name> [--topic <t>] [--context <c>]
  ${cyan}agenthub room:add${RESET} <room> <session> [--alias <a>]
  ${cyan}agenthub room:post${RESET} <room> <message>
  ${cyan}agenthub --version${RESET} | ${cyan}--help${RESET}

${BOLD}Examples:${RESET}
  ${gray}# Ask the session named "api" for a status update${RESET}
  agenthub send api "What's left on the migration?"

  ${gray}# Spin up a helper in another repo and drop it into a room${RESET}
  agenthub spawn --cwd ~/code/web --name web-helper --room checkout --prompt "Read the room briefing and wait."
`);
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/** Expand a leading `~/` (shells don't expand it inside `--cwd=~/x`). */
function expandHome(p: string): string {
  return p.startsWith("~/") ? `${Bun.env.HOME ?? ""}${p.slice(1)}` : p;
}

function need(value: string | undefined, what: string): string {
  if (!value) ValidationError.throw(`Missing ${what}. Run 'agenthub --help'.`, what);
  return value;
}

/**
 * Parse argv into a typed {@link CliResult}.
 *
 * @throws ValidationError on missing or invalid arguments.
 */
export function parseCli(argv: string[] = Bun.argv.slice(2)): CliResult {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      json: { type: "boolean" },
      port: { type: "string" },
      cwd: { type: "string" },
      name: { type: "string" },
      prompt: { type: "string" },
      mode: { type: "string" },
      model: { type: "string" },
      room: { type: "string" },
      topic: { type: "string" },
      context: { type: "string" },
      alias: { type: "string" },
    },
  });

  if (values.version) return { type: "version" };
  const [command, ...rest] = positionals;
  if (values.help || !command) return { type: "help" };

  switch (command) {
    case "server": {
      const port = values.port ? Number(values.port) : undefined;
      if (port !== undefined && !Number.isInteger(port)) ValidationError.throw("--port must be a number", "port");
      return { type: "server", port };
    }
    case "tui":
      return { type: "tui" };
    case "ls":
      return { type: "ls", json: values.json === true || !process.stdout.isTTY };
    case "send":
      return { type: "send", session: need(rest[0], "<session>"), body: need(rest.slice(1).join(" "), "<message>") };
    case "spawn": {
      const mode = values.mode;
      if (mode !== undefined && !(PERMISSION_MODES as readonly string[]).includes(mode)) {
        ValidationError.throw(`--mode must be one of: ${PERMISSION_MODES.join(", ")}`, "mode");
      }
      return {
        type: "spawn",
        cwd: expandHome(values.cwd ?? process.cwd()),
        name: need(values.name, "--name"),
        prompt: values.prompt,
        permissionMode: mode as PermissionMode | undefined,
        model: values.model,
        roomId: values.room,
      };
    }
    case "rooms":
      return { type: "rooms" };
    case "room:create":
      return { type: "room:create", name: need(rest.join(" "), "<name>"), topic: values.topic, context: values.context };
    case "room:add":
      return { type: "room:add", roomId: need(rest[0], "<room>"), session: need(rest[1], "<session>"), alias: values.alias };
    case "room:post":
      return { type: "room:post", roomId: need(rest[0], "<room>"), body: need(rest.slice(1).join(" "), "<message>") };
    default:
      return ValidationError.throw(`Unknown command '${command}'. Run 'agenthub --help'.`, "command");
  }
}
