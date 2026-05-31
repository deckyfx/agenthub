import type { AgentStatus } from "./stores/agent-store";
import type { MessageType } from "./stores/message-store";

// ─── Result Types ──────────────────────────────────────────────────────────────

export type CliResult =
  | { type: "server"; port?: number }
  | { type: "init"; dbPath?: string }
  | { type: "agent:register"; id: string; dir: string; name: string }
  | { type: "agent:heartbeat"; alias: string; channel: string; status: AgentStatus }
  | { type: "group:create"; id: string; name: string; description?: string }
  | { type: "group:add"; group: string; agent: string }
  | { type: "group:members"; group: string }
  | { type: "channel:create"; id: string; topic: string; by: string }
  | { type: "channel:join"; agent?: string; channel: string; alias: string; role?: string; group?: string }
  | { type: "channel:leave"; agent: string; channel: string }
  | { type: "channel:list"; agent: string }
  | { type: "channel:members"; channel: string }
  | { type: "prompt"; channel: string; alias: string }
  | { type: "inbox:poll"; alias: string; channel: string }
  | { type: "inbox:wait"; alias: string; channel: string; timeout: number }
  | {
      type: "message:send";
      from?: string;
      channel: string;
      to?: string;
      msgType?: MessageType;
      payload: string;
    }
  | { type: "message:done"; id: number; agent: string }
  | {
      type: "context:inject";
      content: string;
      channel?: string;
      to?: string;
      toGroup?: string;
      priority: "normal" | "urgent";
    }
  | { type: "context:applied"; id: number; agent: string }
  | { type: "help" }
  | { type: "error"; message: string };

// ─── Argument Parser ──────────────────────────────────────────────────────────

/** Parse Bun.argv into a typed CliResult */
export function parseCli(): CliResult {
  const args = Bun.argv.slice(2); // skip bun + script path
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    return { type: "help" };
  }

  // Build a simple flag map from remaining args
  const flags = parseFlags(args.slice(1));

  // Identity synonyms: an agent's identity is its alias. Let --as / --alias
  // stand in for --agent / --id on the commands that identify the caller, so
  // the agent only ever passes one token. (channel:join keeps --alias for the
  // alias itself and only borrows --as for the optional explicit id.)
  if (cmd !== "channel:join") {
    const identity = flags["agent"] ?? flags["as"] ?? flags["alias"];
    if (identity !== undefined) {
      flags["agent"] ??= identity;
      flags["id"] ??= identity;
    }
  }

  try {
    if (cmd === "server") {
      return {
        type: "server",
        port: flags["port"] ? parseInt(flags["port"], 10) : undefined,
      };
    }

    switch (cmd) {
      case "init":
        return { type: "init", dbPath: flags["db"] };

      case "agent:register":
        requireFlags(flags, ["id", "dir", "name"]);
        return {
          type: "agent:register",
          id: flags["id"]!,
          dir: flags["dir"]!,
          name: flags["name"]!,
        };

      case "agent:heartbeat":
        // Identity is channel-scoped: --as/--alias gives the alias, plus --channel.
        requireFlags(flags, ["agent", "channel", "status"]);
        return {
          type: "agent:heartbeat",
          alias: flags["agent"]!,
          channel: flags["channel"]!,
          status: flags["status"] as AgentStatus,
        };

      case "group:create":
        requireFlags(flags, ["id", "name"]);
        return {
          type: "group:create",
          id: flags["id"]!,
          name: flags["name"]!,
          description: flags["description"],
        };

      case "group:add":
        requireFlags(flags, ["group", "agent"]);
        return {
          type: "group:add",
          group: flags["group"]!,
          agent: flags["agent"]!,
        };

      case "group:members":
        requireFlags(flags, ["group"]);
        return { type: "group:members", group: flags["group"]! };

      case "channel:create":
        requireFlags(flags, ["id", "topic"]);
        return {
          type: "channel:create",
          id: flags["id"]!,
          topic: flags["topic"]!,
          by: flags["by"] ?? "moderator",
        };

      case "channel:join":
        // --agent is optional; identity defaults to --alias.
        requireFlags(flags, ["channel", "alias"]);
        return {
          type: "channel:join",
          agent: flags["agent"] ?? flags["as"],
          channel: flags["channel"]!,
          alias: flags["alias"]!,
          role: flags["role"],
          group: flags["group"],
        };

      case "channel:leave":
        requireFlags(flags, ["agent", "channel"]);
        return {
          type: "channel:leave",
          agent: flags["agent"]!,
          channel: flags["channel"]!,
        };

      case "channel:list":
        requireFlags(flags, ["agent"]);
        return { type: "channel:list", agent: flags["agent"]! };

      case "channel:members":
        requireFlags(flags, ["channel"]);
        return { type: "channel:members", channel: flags["channel"]! };

      case "prompt":
        // Print a member's join prompt. Identity is the alias within a channel.
        requireFlags(flags, ["channel", "alias"]);
        return { type: "prompt", channel: flags["channel"]!, alias: flags["alias"]! };

      case "inbox:poll":
        requireFlags(flags, ["agent", "channel"]);
        return { type: "inbox:poll", alias: flags["agent"]!, channel: flags["channel"]! };

      case "inbox:wait":
        requireFlags(flags, ["agent", "channel"]);
        return {
          type: "inbox:wait",
          alias: flags["agent"]!,
          channel: flags["channel"]!,
          timeout: flags["timeout"] ? parseInt(flags["timeout"], 10) : 30,
        };

      case "message:send":
        // Only channel + payload are required. Sender defaults to "moderator";
        // recipients and type come from @mentions / a leading /type in the body.
        requireFlags(flags, ["channel", "payload"]);
        return {
          type: "message:send",
          from: flags["from"] ?? flags["as"],
          channel: flags["channel"]!,
          to: flags["to"],
          msgType: flags["type"] as MessageType | undefined,
          payload: flags["payload"]!,
        };

      case "message:done":
        requireFlags(flags, ["id", "agent"]);
        return {
          type: "message:done",
          id: parseInt(flags["id"]!, 10),
          agent: flags["agent"]!,
        };

      case "context:inject":
        requireFlags(flags, ["content"]);
        return {
          type: "context:inject",
          content: flags["content"]!,
          channel: flags["channel"],
          to: flags["to"],
          toGroup: flags["to-group"],
          priority: (flags["priority"] as "normal" | "urgent") ?? "normal",
        };

      case "context:applied":
        requireFlags(flags, ["id", "agent"]);
        return {
          type: "context:applied",
          id: parseInt(flags["id"]!, 10),
          agent: flags["agent"]!,
        };

      default:
        return { type: "error", message: `Unknown command: ${cmd}` };
    }
  } catch (err) {
    return {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse --key value pairs from argv slice.
 * Supports: --key value, --key=value
 */
function parseFlags(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (!arg) { i++; continue; }

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        result[key] = val;
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          result[key] = next;
          i++;
        } else {
          result[key] = "true";
        }
      }
    }
    i++;
  }

  return result;
}

/** Throw if any required flags are missing */
function requireFlags(flags: Record<string, string | undefined>, required: string[]): void {
  const missing = required.filter((k) => !flags[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required flags: ${missing.map((f) => `--${f}`).join(", ")}`);
  }
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export function printUsage(): void {
  const bold = process.stdout.isTTY ? "\x1b[1m" : "";
  const cyan = process.stdout.isTTY ? (Bun.color("cyan", "ansi") ?? "") : "";
  const reset = process.stdout.isTTY ? "\x1b[0m" : "";

  console.log(`
${bold}agenthub${reset} — Multi-agent Claude CLI orchestration hub

${bold}Usage:${reset}
  ${cyan}agenthub <command> [--flags]${reset}

${bold}Commands:${reset}
  ${cyan}server${reset}                             Start dashboard + API server
    [--port <number>]                   HTTP port (default: 3000)

  ${cyan}init${reset}                               Initialize hub database
    --db <path>                         Database path (default: ./data/hub.db)

  ${cyan}agent:register${reset}                     Register an agent
    --id <id> --dir <path> --name <name>

  ${cyan}agent:heartbeat${reset}                    Send heartbeat + status
    --as <alias> --channel <id> --status <idle|working|waiting|blocked|done>

  ${cyan}group:create${reset}                       Create a project group
    --id <id> --name <name> [--description <desc>]

  ${cyan}group:add${reset}                          Add agent to group
    --group <id> --agent <id>

  ${cyan}group:members${reset}                      List group members
    --group <id>

  ${cyan}channel:create${reset}                     Create a channel
    --id <id> --topic <topic> [--by <agent>]

  ${cyan}channel:join${reset}                       Subscribe to channel with alias (auto-registers)
    --channel <id> --alias <name> [--role <desc>] [--group <id>] [--as <id>]

  ${cyan}channel:leave${reset}                      Unsubscribe from channel
    --agent <id> --channel <id>

  ${cyan}channel:list${reset}                       List agent's subscriptions
    --agent <id>

  ${cyan}channel:members${reset}                    List channel members
    --channel <id>

  ${cyan}prompt${reset}                             Print a member's join prompt (execute & follow it)
    --channel <id> --alias <name>

  ${cyan}inbox:poll${reset}                         Poll for new messages + context (channel-scoped)
    --as <alias> --channel <id>

  ${cyan}inbox:wait${reset}                         Block until message arrives (channel-scoped)
    --as <alias> --channel <id> [--timeout <seconds>]

  ${cyan}message:send${reset}                       Send a message (recipients & type parsed from body)
    --channel <id> --payload '<text with @alias / @group:id and optional /type>'
    [--as <alias>]  (sender, default: moderator)  [--to <alias>]  [--type <type>]

  ${cyan}message:done${reset}                       Mark message as done
    --id <id> --agent <id>

  ${cyan}context:inject${reset}                     Inject moderator context
    --content <text> [--channel <id>] [--to <id|@alias>] [--to-group <id>]
    [--priority normal|urgent]

  ${cyan}context:applied${reset}                    Mark context as applied
    --id <id> --agent <id>
`);
}
