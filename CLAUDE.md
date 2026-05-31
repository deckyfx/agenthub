# AgentHub — Codebase Guide

Multi-agent Claude CLI orchestration hub. Single Bun project with a CLI tool and embedded Elysia dashboard.

## Stack

- **Runtime**: Bun (native SQLite, native file ops)
- **Server**: Elysia v1 + Eden Treaty (type-safe client)
- **DB**: Drizzle ORM + SQLite (bun:sqlite)
- **Frontend**: React 19 + Tailwind CSS v4 (via bun-plugin-tailwind)
- **TypeScript**: strict, no `any`, TSDoc on all public APIs

## Project Layout

```
src/
├── index.ts              # CLI entry point — dispatches all commands
├── cli-parser.ts         # Typed arg parser → CliResult union
├── env-config.ts         # Singleton env config (HUB_DB_PATH, SERVER_PORT)
├── db/
│   ├── schema.ts         # 6 Drizzle tables (agents, channels, agent_groups, agent_group_members, agent_channels, messages, context)
│   ├── index.ts          # SQLite connection (WAL mode, FK on)
│   ├── migration-manager.ts
│   └── migrate.ts        # CLI runner: bun run db:migrate
├── stores/               # Repository pattern — one static class per table
│   ├── agent-store.ts
│   ├── channel-store.ts
│   ├── group-store.ts
│   ├── message-store.ts
│   └── context-store.ts
├── commands/             # One file per CLI command group
│   ├── server.ts         # agenthub server
│   ├── agent.ts          # agenthub agent:*
│   ├── channel.ts        # agenthub channel:*
│   ├── group.ts          # agenthub group:*
│   ├── inbox.ts          # agenthub inbox:*
│   ├── message.ts        # agenthub message:*
│   ├── context.ts        # agenthub context:*
│   └── init.ts           # agenthub init
├── errors/
│   └── custom-errors.ts  # Typed error classes (AgentHubError subclasses)
├── lib/
│   └── error-handler.ts  # catchError / catchErrorTyped (Go-style)
└── server/
    ├── index.ts          # createServer() / startServer()
    ├── plugins/
    │   ├── routeApi.ts   # All REST endpoints (Elysia plugin, prefix /api)
    │   └── routeApp.ts   # React SPA wildcard routes
    └── public/
        ├── index.html    # HTML entry (imports tailwindcss, index.tsx)
        ├── index.tsx     # React app root + sidebar nav
        ├── lib/api.ts    # Eden Treaty client (window.location.origin)
        ├── components/
        │   ├── StatusBadge.tsx
        │   └── InjectPanel.tsx
        └── pages/
            ├── OverviewPage.tsx   # Agents grouped by project + inject
            ├── ChannelPage.tsx    # Message feed + member list
            └── AgentPage.tsx      # Agent detail + status override
```

## Core Design: Channels as the Unit of Work

A **channel** is the primary unit of work and collaboration. Each channel represents a single topic, feature, or discussion thread. There are no separate task objects — agents coordinate entirely through messages within channels.

Typical workflow:
1. **Create a channel** with a descriptive topic (`channel:create`)
2. **Add context** to the channel so agents have background (`context:inject`)
3. **Invite agents** by having them join with aliases and group (`channel:join --group` auto-creates the group)
4. **Agents discuss** by sending and receiving messages (`message:send`, `inbox:poll`)

## Database

Single SQLite file, path from `HUB_DB_PATH` env var (default: `~/.agenthub/hub.db`).
The directory is auto-created on first access.

Tables: `agents`, `channels`, `agent_groups`, `agent_group_members`, `agent_channels`, `messages`, `context`.

Key constraints:
- `agent_channels` has a composite PK `(agent_id, channel_id)` and a UNIQUE on `(channel_id, alias)` — aliases are channel-scoped and must be unique per channel.
- `agent_group_members` has composite PK `(agent_id, group_id)`.
- All operations go through Store classes, never raw DB queries in command handlers.

## CLI Commands

All commands output JSON to stdout. Errors output `{ ok: false, error: "..." }` and exit 1.

```
agenthub server                    # Start Elysia dashboard + API
agenthub init                      # Create/init hub.db
agenthub agent:register            # Register agent
agenthub agent:heartbeat           # Update status + heartbeat
agenthub group:create / add / members
agenthub channel:create / join [--group] / leave / list / members
agenthub inbox:poll                # Get pending messages + context
agenthub inbox:wait                # Block until message arrives (1s poll loop)
agenthub message:send              # Send to channel or agent (@alias supported)
agenthub message:done              # Mark message done
agenthub context:inject / applied
```

## Error Handling

Use `catchErrorTyped` from `src/lib/error-handler.ts` (Go-style tuples, not try/catch).
Throw typed errors from `src/errors/custom-errors.ts` — never throw plain strings.

## Adding a New Command

1. Add a new variant to `CliResult` in `src/cli-parser.ts`
2. Parse the flags in `parseCli()` switch
3. Create a handler function in `src/commands/<scope>.ts`
4. Add the `case` to `dispatch()` in `src/index.ts`

## Dev Scripts

```bash
bun run dev          # Start server (agenthub server) with hot reload
bun run typecheck    # tsc --noEmit — must be zero errors
bun run db:generate  # Generate Drizzle migration from schema changes
bun run db:migrate   # Apply pending migrations
bun run db:studio    # Drizzle Studio (visual DB browser)
```
