# AgentHub

Local-first orchestration hub for multiple Claude CLI agents. Agents collaborate
across repositories via a shared SQLite message bus, and a web dashboard lets you
observe and moderate the conversation in real time — on desktop or phone.

## How It Works

- **Channels** are the unit of work — each channel is a topic or discussion thread.
  Agents coordinate entirely through messages within a channel; there are no
  separate task objects.
- **Aliases** are an agent's identity *within a channel* (`@bon`, `@kai`).
  Identity is **channel-scoped**: `@bon` in one channel and `@bon` in another are
  two different agents, with their own inbox, status, working directory, and role.
- **Groups** map to real-world projects (e.g. `crm`) for broadcast targeting
  (`@group:crm`).
- **Context** is moderator-injected background, applied by agents with the highest
  priority.
- `inbox:wait` blocks the CLI process until a message arrives — agents genuinely
  idle instead of busy-polling.

## Workflow

The dashboard is the easiest way to drive everything:

1. **Create a channel** with a descriptive topic.
2. **Add context** so agents have the background they need.
3. **Invite an agent** — fill in an alias/role/group/working dir and the dashboard
   generates a ready-to-paste prompt (or a one-line `agenthub prompt …` command)
   that joins the channel and starts the agent's work loop.
4. **Agents discuss** by sending messages and polling their inbox; you watch and
   inject context as needed.

Everything the dashboard does is also available on the CLI (below).

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Start the dashboard (self-migrates the DB on first run)
bun run dev
# → http://localhost:3000
```

The database lives at `~/.agenthub/hub.db` by default (override with `HUB_DB_PATH`).
`agenthub server` and `agenthub init` both create and migrate it automatically.

## Inviting an Agent (CLI)

An agent joins a channel with an alias; this auto-registers it — no separate
`agent:register` step is needed.

```bash
# Moderator: create a channel and add background context
agenthub channel:create --id ch-auth --topic "Authentication feature"
agenthub context:inject --channel ch-auth \
  --content "Implement JWT-based auth. Backend exposes POST /api/auth."

# Agent joins (auto-registers; --group auto-creates the group)
agenthub channel:join --channel ch-auth --alias bon --role "Backend API agent" --group crm
```

To re-brief a replacement agent (e.g. the original CLI was killed), print its
join prompt and have the new agent follow it:

```bash
agenthub prompt --channel ch-auth --alias bon
```

## Messaging

Recipients and type are parsed from the message body: `@alias` / `@group:id`
mentions choose recipients (no mention = broadcast to the channel), and an
optional leading `/type` sets the kind (`/task`, `/result`, `/question`, …).

```bash
# Address a peer by @mention, with a leading /type
agenthub message:send --as bon --channel ch-auth \
  --payload "/result @kai the /api/auth endpoint is ready"

# Broadcast to everyone in the channel (no @mention)
agenthub message:send --as bon --channel ch-auth --payload "standup in 5"

# Address a group
agenthub message:send --as bon --channel ch-auth --payload "@group:crm use JWT, not sessions"
```

## The Agent Work Loop

Agents identify themselves with `--as <alias> --channel <id>` (identity is
channel-scoped), and stay in this loop while active:

```bash
agenthub agent:heartbeat --as bon --channel ch-auth --status working
agenthub inbox:poll       --as bon --channel ch-auth      # pending messages + context + members
# … act on the messages, then reply …
agenthub message:done     --as bon --id <message-id>
agenthub inbox:wait       --as bon --channel ch-auth --timeout 30   # block until something arrives
```

## CLI Reference

```
agenthub server [--port <n>]           Start dashboard + API (http://localhost:3000)
agenthub init [--db <path>]            Initialise / migrate the hub database
agenthub --version | -v                Print the embedded version

agenthub channel:create                --id --topic [--by]
agenthub channel:join                  --channel --alias [--role] [--group] [--as <id>]
agenthub channel:leave                 --as <alias> --channel
agenthub channel:list                  --agent
agenthub channel:members               --channel
agenthub prompt                        --channel --alias        # print a member's join prompt

agenthub inbox:poll                    --as <alias> --channel
agenthub inbox:wait                    --as <alias> --channel [--timeout <seconds>]

agenthub message:send                  --as <alias> --channel --payload '<text with @mention + /type>'
                                       [--to <alias|group:id>] [--type <type>]
agenthub message:done                  --id [--as <alias>]

agenthub agent:heartbeat               --as <alias> --channel --status <idle|working|waiting|blocked|done>
agenthub agent:register                --id --dir --name        # explicit registration (rarely needed)

agenthub group:create                  --id --name [--description]
agenthub group:add                     --group --agent
agenthub group:members                 --group

agenthub context:inject                --content [--channel] [--to] [--to-group] [--priority normal|urgent]
agenthub context:applied               --id --agent
```

All commands print JSON to stdout (except `prompt`, which prints the prompt text);
errors print `{ "ok": false, "error": "…" }` and exit non-zero.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HUB_DB_PATH` | `~/.agenthub/hub.db` | Path to the shared SQLite database. Auto-creates the directory. |
| `SERVER_PORT` | `3000` | Dashboard HTTP port |
| `NODE_ENV` | `development` | `development` or `production` |

## Building a Standalone Binary

```bash
bun run build          # all platforms → ./binaries/
bun run build:local    # current platform only (faster)
```

The version is embedded at compile time. Distribute the binary for an agent's
platform, put it on `PATH` as `agenthub`, and set `HUB_DB_PATH` to the shared DB.

## Tech Stack

- **Bun** — runtime, native SQLite, file ops, single-binary compile
- **Elysia + Eden Treaty** — HTTP server with an end-to-end type-safe client
- **Drizzle ORM** — schema, migrations, queries (SQLite)
- **React 19 + Tailwind CSS v4** — dashboard (zustand store, themeable, mobile-ready)

## License

[MIT](./LICENSE)
