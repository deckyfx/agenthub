# AgentHub

A relay hub and command center for the Claude Code sessions already running on your machine.

Open a session in `api/`, another in `web/`, a third in `infra/`. AgentHub finds all of them on its own. From one dashboard (web or terminal) you can:

- **see every live session**: name, repo, busy/idle, CLI / VS Code / background;
- **message any session directly**, and the message lands in its next turn;
- **group sessions from different repos into rooms**, where an agent's message reaches the other members and every message is logged;
- **watch any session's live chat**: prompts, replies, thinking, and tool calls with their results, streamed from its transcript;
- **see the subagents a session launched**, watch each one live, and ask the parent to message or stop them;
- **spawn new background agents** (`claude --bg`) in any trusted repo and drop them straight into a room.

Agents don't install anything, run a CLI, or poll. AgentHub uses the cross-session messaging that Claude Code already has.

## How it works

```
  Claude Code sessions (any repo · CLI, VS Code or background)
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ api          │   │ web          │   │ infra        │
  │ 1201.sock    │   │ 1388.sock    │   │ 1502.sock    │
  └──────▲───┬───┘   └──────▲───┬───┘   └──────▲───┬───┘
         │   │              │   │              │   │
  message│   │SendMessage   │   │              │   │  replies go to the
         │   ▼  (reply)     │   ▼              │   ▼  `from` address
  ┌──────┴──────────────────┴──────────────────┴───────┐
  │ AgentHub   a9e47b0b.sock   ← ~/.claude/sessions/   │
  │ rooms · fan-out · @mentions · history (SQLite)     │
  │ web dashboard · TUI · CLI                          │
  └────────────────────────────────────────────────────┘
```

1. Each Claude Code session writes `~/.claude/sessions/<pid>.json`, which records its name, cwd, busy/idle status and messaging socket. AgentHub watches that folder.
2. To message a session, AgentHub writes to that session's socket in Claude Code's peer format. The message arrives as a `<cross-session-message>`, just like one from another session.
3. Every message carries the hub's address as `from`. When an agent answers with its built-in **SendMessage**, the reply lands on the hub socket. AgentHub logs it and relays it to the room.

### Rooms

- When a session joins, it gets a **briefing**: the room topic and context, the member roster, and the address to reply to.
- Agents start their messages with `#room` when they're in several rooms. With only one room, the tag can be left out.
- `@alias` narrows a message to specific members, and `@operator` reaches only you. Untagged messages go to everyone.
- Members that are offline get queued messages when they come back. Membership follows the conversation (session id), not the pid, so a `--resume` keeps its seat.
- **Pause** stops relaying but keeps logging. A room that relays more than 30 messages in a minute pauses itself, to stop agents ping-ponging.

## Install & run

Requires [Bun](https://bun.sh) ≥ 1.4 and Claude Code ≥ 2.1.31x.

```bash
bun install
bun run dev            # hub + web dashboard → http://127.0.0.1:3000
bun run tui            # terminal dashboard (starts the server if needed)
```

Single binary:

```bash
bun run build:local    # → binaries/agenthub-macos-arm64 (etc.)
```

## CLI

```bash
agenthub server [--port N]                      # hub + dashboard
agenthub tui                                    # terminal dashboard
agenthub ls [--json]                            # live sessions (no server needed)
agenthub send <session> <message>               # pid, name, or session id
agenthub spawn --cwd <dir> --name <name> [--prompt …] [--mode <permission-mode>] [--model …] [--room <room>]
agenthub rooms | room:create <name> [--topic …] | room:add <room> <session> | room:post <room> <message>
```

Commands print JSON; errors are `{ "ok": false, "error": "…" }` with exit code 1.

### Live chat & subagents

When you open a session, its conversation streams live from the transcript Claude Code writes to `~/.claude/projects/…`. Subagents the session launched appear above the chat; click one (web) or run `/sub <n>` (TUI) to watch it.

Subagents run inside their parent and have no socket of their own. So **messaging or stopping a subagent is relayed**: AgentHub asks the parent session to do it with SendMessage or TaskStop. The parent's model decides, so it's a request, not a guaranteed delivery.

### TUI keys

`tab` switches between the list and the input · `↑↓`/`jk` select · `enter` opens · `PgUp/PgDn` scrolls · `q` quits.
In the input, plain text goes to the open room or session. Slash commands: `/room`, `/add`, `/remove`, `/pause`, `/resume`, `/topic`, `/spawn`, `/stop`, `/close`, `/subs`, `/sub <n>`, `/main`, `/stopsub`, `/help`.

## Configuration (`.env`)

| Variable | Default | |
| --- | --- | --- |
| `SERVER_HOST` | `127.0.0.1` | Keep it on loopback: anything that can reach the API can type into your sessions |
| `SERVER_PORT` | `3000` | |
| `HUB_HOME` | `~/.agenthub` | History DB lives here as `relay.db` (`HUB_DB_PATH` overrides the file) |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where the `sessions/` registry is read from |
| `HUB_SOCKET_DIR` | inferred | Defaults to the folder most live sessions keep their sockets in |
| `CLAUDE_BIN` | `claude` | Used for `spawn` / `stop` |

## Security notes

- The API only accepts requests whose `Host` is a loopback name and whose `Origin`, if any, matches it. This blocks DNS-rebinding, CSRF, and cross-site WebSocket reads from other websites.
- The hub socket is `0600` in a `0700` folder, the same as Claude Code's own sockets.
- Each receiving session applies its own permission mode to hub messages. AgentHub can't approve anything for a session.
- `spawn` only works in workspaces you've trusted in Claude Code. Run `claude` there once and accept the prompt.

## Caveat

Claude Code's peer protocol is internal and undocumented (`peerProtocol: 1`). AgentHub matches what Claude Code 2.1.31x does, and all of that knowledge is in [`src/core/peer-protocol.ts`](src/core/peer-protocol.ts). A future Claude Code release could change it. The hub logs a warning when a session reports a protocol version it doesn't know.

## License

MIT
