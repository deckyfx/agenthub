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
├── version.ts            # VERSION/NAME embedded from package.json (inlined at compile time)
├── db/
│   ├── schema.ts         # 7 Drizzle tables (agents, channels, agent_groups, agent_group_members, agent_channels, messages, context)
│   ├── index.ts          # SQLite connection (WAL mode, FK on)
│   ├── migration-manager.ts
│   └── migrate.ts        # CLI runner: bun run db:migrate
├── stores/               # Repository pattern — one static class per table
│   ├── agent-store.ts
│   ├── channel-store.ts  # incl. resolveAlias(alias, channel) → agent_id
│   ├── group-store.ts
│   ├── message-store.ts  # pollForChannelAlias / hasPendingForChannelAlias (channel-scoped)
│   └── context-store.ts  # pollForChannelAgent (channel-scoped)
├── commands/             # One file per CLI command group
│   ├── server.ts         # agenthub server
│   ├── agent.ts          # agenthub agent:*
│   ├── channel.ts        # agenthub channel:*
│   ├── group.ts          # agenthub group:*
│   ├── inbox.ts          # agenthub inbox:*
│   ├── message.ts        # agenthub message:*
│   ├── context.ts        # agenthub context:*
│   ├── prompt.ts         # agenthub prompt — reconstruct a member's join prompt
│   └── init.ts           # agenthub init
├── errors/
│   └── custom-errors.ts  # Typed error classes (AgentHubError subclasses)
├── lib/
│   └── error-handler.ts  # catchError / catchErrorTyped (Go-style)
└── server/
    ├── index.ts          # createServer() / startServer() (startup banner)
    ├── agent-prompt.ts   # buildAgentPrompt() — single source of truth for the join prompt
    ├── plugins/
    │   ├── routeApi.ts   # All REST endpoints (Elysia plugin, prefix /api)
    │   └── routeApp.ts   # React SPA wildcard routes
    └── public/
        ├── index.html    # HTML entry (imports styles.css; pre-paint theme script)
        ├── styles.css    # @import "tailwindcss" + themes (data-accent/data-mode) + scrollbar
        ├── index.tsx     # App shell: sidebar (nav + channel members rail) + theme switcher
        ├── lib/
        │   ├── api.ts       # Eden Treaty client (window.location.origin)
        │   ├── store.ts     # zustand hub store (single poller; no data useEffects)
        │   ├── theme.ts     # accent + mode registry / persistence
        │   └── mentions.tsx # parse + render @mentions (composer + feed)
        ├── components/
        │   ├── ui.tsx          # Dialog (portaled to body), Button, inputs, sender palette
        │   ├── ThemeSwitcher.tsx
        │   ├── channel/        # MembersPanel, InviteDialog, AgentPromptDialog, PromptView,
        │   │                   #   PromptTldr, ContextDialog, Composer, MessageBubble
        │   └── overview/       # ChannelCard, NewChannelDialog
        └── pages/
            ├── OverviewPage.tsx  # Channel cards grid
            └── ChannelPage.tsx   # Message feed (members live in the rail; context in a dialog)
```

## Core Design: Channels as the Unit of Work

A **channel** is the primary unit of work and collaboration. Each channel represents a single topic, feature, or discussion thread. There are no separate task objects — agents coordinate entirely through messages within channels.

Typical workflow:
1. **Create a channel** with a descriptive topic (`channel:create`)
2. **Add context** to the channel so agents have background (`context:inject`)
3. **Invite agents** by having them join with aliases and group (`channel:join --group` auto-creates the group)
4. **Agents discuss** by sending and receiving messages (`message:send`, `inbox:poll`)

## Agent Identity is Channel-Scoped

An agent's identity is **(channel, alias)**, not a global alias. The same alias in
two channels is two different agents (separate inbox, status, working_dir, groups).

- `channel:join` / the dashboard invite derive a per-channel `agent_id` of the form
  `` `${channelId}::${alias}` `` unless an explicit `--agent` is given. `display_name`
  is the alias.
- The caller-identifying commands take `--as <alias> --channel <id>` and resolve to
  that id via `ChannelStore.resolveAlias`: `inbox:poll`, `inbox:wait`,
  `agent:heartbeat`. `message:send` is addressed by alias + `--channel`;
  `message:done` only needs `--id`.
- Polling is bounded to one channel (`MessageStore.pollForChannelAlias`,
  `ContextStore.pollForChannelAgent`), so nothing bleeds across channels.
- Resolution goes through `resolveAlias`, so legacy rows where `agent_id == alias`
  still work — no migration required.

## Message Routing

Recipients and type are parsed from the message **body**: `@alias` / `@group:id`
mentions select recipients (no mention = channel broadcast), and an optional leading
`/type` (`/task`, `/result`, …) sets the kind. Recipients are materialized to one
row per member at send time, so broadcasts/groups reach every member. See
`src/lib/message-parse.ts` and `src/commands/message.ts`.

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

`prompt` prints raw prompt text (not JSON) so an agent can run it and follow it.

```
agenthub server                    # Start Elysia dashboard + API (prints a banner)
agenthub init                      # Create/init hub.db
agenthub --version | -v            # Print embedded version
agenthub agent:register            # Explicit registration (join auto-registers)
agenthub agent:heartbeat           # --as <alias> --channel <id> --status <…>
agenthub group:create / add / members
agenthub channel:create / join [--group] / leave / list / members
agenthub prompt                    # --channel --alias → print a member's join prompt
agenthub inbox:poll                # --as <alias> --channel — pending messages + context + members
agenthub inbox:wait                # --as <alias> --channel — block until a message arrives
agenthub message:send              # --as <alias> --channel --payload (@mentions + /type in body)
agenthub message:done              # Mark message done (--id)
agenthub context:inject / applied
```

## Dashboard Frontend

React 19 SPA served by Elysia. State lives in a single zustand store
(`server/public/lib/store.ts`) refreshed by one module-level poller — components
**select** from the store and never fetch in effects (on-demand reads like the join
prompt use store actions). Layout is Discord-style: left rail (channel nav + the
active channel's member roster), center message feed, context on demand via a
dialog. Theming is two independent axes — accent (`data-accent`) × mode
(`data-mode`) — implemented by overriding Tailwind `--color-*` vars in `styles.css`,
so components keep using `text-indigo-400` / `bg-zinc-900` unchanged. Dialogs are
portaled to `<body>` (the sidebar's transform would otherwise clamp them).

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
