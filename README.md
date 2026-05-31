# AgentHub

Local-first orchestration hub for multiple Claude CLI agents. Agents collaborate across repositories via a SQLite message bus. A web dashboard lets you observe and moderate in real time.

## How It Works

- **Agents** are Claude CLI processes, each in their own repo directory
- **Channels** are the unit of work — each channel is a topic or discussion thread agents subscribe to
- **Groups** map to real-world projects (e.g. `crm`, `rdo`) for broadcast targeting
- **Aliases** give agents human-readable names within a channel (`@fred`, `@bon`)
- `inbox:wait` blocks the CLI process until a message arrives — agents genuinely idle, no busy-polling
- The moderator injects context via the dashboard with the highest priority

## Workflow

1. **Create a channel** with a descriptive topic — the channel is the unit of work
2. **Add context** so agents have the background they need before starting
3. **Invite agents** by having them join the channel with roles and aliases
4. **Agents discuss** by exchanging messages; each agent polls its inbox and replies

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Generate and apply DB migrations (first run only)
bun run db:generate
bun run db:migrate

# 3. Start the dashboard
bun run dev
# → http://localhost:3000
```

## Registering Agents

```bash
# Register agents (one-time per agent)
agenthub agent:register --id crm-backend  --dir /workspace/crm/backend  --name "CRM Backend"
agenthub agent:register --id crm-mobile   --dir /workspace/crm/mobile   --name "CRM Mobile"
agenthub agent:register --id orchestrator --dir /workspace              --name "Orchestrator"

# Launch agents (each in its own terminal, pointed at the same DB)
HUB_DB_PATH=~/.agenthub/hub.db AGENT_ID=orchestrator claude   # /workspace
HUB_DB_PATH=~/.agenthub/hub.db AGENT_ID=crm-backend  claude   # /workspace/crm/backend
HUB_DB_PATH=~/.agenthub/hub.db AGENT_ID=crm-mobile   claude   # /workspace/crm/mobile
```

## Agent Communication

```bash
# 1. Moderator creates a channel and adds background context
agenthub channel:create --id ch-auth --topic "Authentication feature"
agenthub context:inject --channel ch-auth --priority normal \
  --content "Implement JWT-based auth. Backend exposes POST /api/auth, mobile consumes it."

# 2. Invite agents — --group auto-creates the group and adds the agent to it
agenthub channel:join --agent crm-backend --channel ch-auth \
  --alias bon  --role "Backend API agent" --group crm
agenthub channel:join --agent crm-mobile  --channel ch-auth \
  --alias fred --role "Flutter AI agent"  --group crm

# Send messages (agents use these inside Claude)
agenthub message:send --from @bon --channel ch-auth --to @fred \
  --type result --payload '{"endpoint":"/api/auth","response":{"token":"...","user":"..."}}'

# Poll inbox (agents call this every loop iteration)
agenthub inbox:poll --agent crm-backend

# Block until a message arrives (up to 60s)
agenthub inbox:wait --agent crm-backend --timeout 60

# Broadcast to an entire group
agenthub message:send --from orchestrator --to-group crm \
  --channel ch-auth --type context --payload '{"note":"Use JWT, not sessions"}'
```

## Moderator Actions

```bash
# Inject context from the terminal (also available in dashboard)
agenthub context:inject --to @fred --channel ch-auth --priority urgent \
  --content "Use GoRouter for navigation, not Navigator.push"

agenthub context:inject --to-group crm --priority urgent \
  --content "Deadline moved to Friday — prioritize login flow"
```

## CLI Reference

```
agenthub server                        Start dashboard + API (http://localhost:3000)
agenthub init [--db <path>]            Initialise hub database

agenthub agent:register                --id --dir --name
agenthub agent:heartbeat               --id --status <idle|working|waiting|blocked|done>

agenthub group:create                  --id --name [--description]
agenthub group:add                     --group --agent
agenthub group:members                 --group

agenthub channel:create                --id --topic [--by]
agenthub channel:join                  --agent --channel --alias [--role] [--group]
agenthub channel:leave                 --agent --channel
agenthub channel:list                  --agent
agenthub channel:members               --channel

agenthub inbox:poll                    --agent
agenthub inbox:wait                    --agent [--timeout <seconds>]

agenthub message:send                  --from --channel --type --payload
                                       [--to <id|@alias>] [--to-group <id>]
agenthub message:done                  --id --agent

agenthub context:inject                --content [--channel] [--to] [--to-group]
                                       [--priority normal|urgent]
agenthub context:applied               --id --agent
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HUB_DB_PATH` | `~/.agenthub/hub.db` | Path to the shared SQLite database. Auto-creates the directory. |
| `SERVER_PORT` | `3000` | Dashboard HTTP port |
| `NODE_ENV` | `development` | `development` or `production` |
| `AGENT_ID` | — | Set per-agent terminal; used as a convenience reference |

## Agent System Prompt (`CLAUDE.md` per repo)

Place this in each agent's working directory:

```markdown
# Agent Identity
- Agent ID: {{AGENT_ID}}
- Role: {{ROLE}}
- Working directory: {{WORKING_DIR}}

# Communication Protocol
Every loop iteration:
1. agenthub agent:heartbeat --id {{AGENT_ID}} --status <current>
2. agenthub inbox:poll --agent {{AGENT_ID}}
3. Apply moderator context FIRST (highest priority)
4. Act on pending messages
5. Report results via agenthub message:send

When waiting for another agent:
- agenthub inbox:wait --agent {{AGENT_ID}} --timeout 30
- Re-poll after waking up

Priority:
1. Moderator context (URGENT) — pause current work
2. Moderator context (NORMAL) — apply before next action
3. Orchestrator messages
4. Peer messages
```

## Tech Stack

- **Bun** — runtime, SQLite, file ops
- **Elysia** — HTTP server + type-safe REST API
- **Eden Treaty** — end-to-end type-safe client (no fetch calls)
- **Drizzle ORM** — schema, migrations, queries
- **React 19 + Tailwind CSS v4** — dashboard frontend
