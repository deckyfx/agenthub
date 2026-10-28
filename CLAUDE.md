# AgentHub — Codebase Guide

Relay hub and command center for **live Claude Code sessions**. It discovers sessions from Claude Code's own registry, messages them over their own peer sockets, groups them into rooms across repos, and spawns new background sessions. It ships as a web dashboard, a TUI and a CLI in one Bun project.

There is no agent-side install. Agents reply using Claude Code's built-in SendMessage.

## Stack

- **Runtime**: Bun ≥ 1.4 (bun:sqlite, Bun.listen/connect for Unix sockets)
- **Server**: Elysia 1.4 + Eden Treaty (REST + `/api/ws` push)
- **DB**: Drizzle ORM + SQLite (history only; sessions are never stored)
- **Web**: React 19 + Tailwind v4 (bun-plugin-tailwind), zustand
- **TUI**: Ink 8 (React), with the same zustand store as the web
- **TypeScript**: strict, no `any`, TSDoc on public APIs. Type-check with `bun check`.

## Layout

```
src/
├── index.ts              # CLI entry → dispatch()
├── cli-parser.ts         # argv → CliResult union (node:util parseArgs)
├── env-config.ts         # typed env singleton
├── build.ts              # single-binary build (stubs Ink's react-devtools-core)
├── test-setup.ts         # bun test preload: isolates every path under /tmp/ah-test-<pid>
├── core/
│   ├── peer-protocol.ts  # ★ ONLY file that knows Claude Code's wire format
│   ├── sessions.ts       # SessionRegistry: watch ~/.claude/sessions, pid liveness, resolve()
│   ├── peer-client.ts    # sendToSession(): auth line + user frame → session socket
│   ├── hub-inbox.ts      # hub's own socket; emits parsed inbound frames
│   ├── hub.ts            # Hub: routing, rooms, fan-out, queueing, burst guard, spawn
│   ├── transcript.ts     # ★ live chat: parse/tail ~/.claude/projects/<cwd>/<sid>.jsonl + subagents
│   ├── chat-key.ts       # browser-safe chat key (session or session/agentId)
│   ├── spawner.ts        # claude --bg / claude stop
│   └── permission-modes.ts # browser-safe constants
├── db/                   # schema (rooms, room_members, messages, deliveries), migrate, embed-migrations
├── stores/               # RoomStore, MessageStore (repository pattern)
├── lib/                  # error-handler (Go-style), emitter, fs.isSocket, client (Eden, terminal), hub-store (shared zustand)
├── server/               # createServer/startServer, plugins/{guard,routeApi,routeApp}
├── web/                  # React SPA (index.html, App.tsx, pages/, components/, lib/)
├── tui/                  # Ink app (App.tsx, commands.ts slash commands)
└── commands/             # CLI handlers (sessions, spawn, rooms)
```

## Claude Code peer protocol (as of 2.1.31x)

Everything below lives in `core/peer-protocol.ts`. If delivery breaks after a Claude Code update, re-derive it from the Claude Code bundle (`strings` on the binary, then search for `uds-messaging` / `cross-session-message`).

- **Registry**: `~/.claude/sessions/<pid>.json` has `{pid, sessionId, cwd, name, status: busy|idle, kind, entrypoint, version, peerProtocol, messagingSocketPath, jobId?}`. The token is in `<pid>.<sha256(socketPath)>.key` → `{peerToken}`.
- **Send**: one connection per message, NDJSON. An optional `{"type":"auth","token"}` line (enforced only on Windows), then `{"msgV":1,"msg_id":uuid,"type":"user","priority":"next","from":"uds:<path>","message":{"role":"user","content":<envelope>}}`.
- **Envelope**: `<cross-session-message from="…" from-name="…">\n body \n</cross-session-message>`. Attribute order matters.
- **Reply targets**: a receiver accepts `from` only if it's a `.sock` file in the receiver's own socket dir, or, across default dirs (`/tmp/cc-socks[-uid]`, `/run/user/N/cc-socks`), one with a `<digits>.sock` or `<1–16 hex>.sock` basename. That's why the hub socket is `a9e47b0b.sock` and sits in the dominant socket dir.
- **Gotcha**: `Bun.file(sock).exists()` is **false** for sockets. Use `lib/fs.isSocket()`.
- **Spawn**: `claude --bg` refuses untrusted workspaces ("Workspace not trusted"), which is mapped to `UntrustedWorkspaceError`. Child processes get an env without `CLAUDECODE` / `CLAUDE_CODE_*`.

## Live chat & subagents (core/transcript.ts)

- Transcript: `~/.claude/projects/<cwd with non-alphanumerics → '-'>/<sessionId>.jsonl` (glob fallback). Records: `user` (prompts, `tool_result`), `assistant` (one content block per record: `text` / `thinking` / `tool_use`), `attachment.type=queued_command` (mid-turn prompts; `origin.kind: "peer"` = cross-session). Everything else is bookkeeping → skipped. `isMeta` user records (skill bodies) are skipped.
- Subagents: `<projects>/<cwd>/<sessionId>/subagents/agent-<id>.jsonl` + `.meta.json` (`agentType`, `description`, `requestShape`). Their records are `isSidechain: true` (kept only when reading a subagent file). "Active" = written within 30 s.
- History reads only the last 1.5 MB. Tails advance past the last `\n` only (torn writes wait). Tails are ref-counted per chat key and exist only while a client watches. Clients send `{type:"watch"|"unwatch", sessionId, agentId?}` over `/api/ws`; entries go to topic `transcript:<chatKey>`.
- Subagents have **no socket**: "message" / "stop" are relayed as a hub DM asking the parent to use SendMessage / TaskStop (`Hub.relayToSubagent`). It's a request to the parent's model, not guaranteed.

## Routing rules (core/hub.ts)

- Inbound sender = the registry session whose `socketPath` matches the frame's `from`.
- Room = leading `#slug` if the sender is a member, otherwise the sender's only room. Otherwise the message is a direct message and is logged in the sender's DM thread.
- Recipients = mentioned member aliases (only aliases that exist count, so `@types/react` still broadcasts). `@operator` alone means no recipients. Otherwise everyone but the sender.
- One `deliveries` row per recipient. `pending` rows flush when the session comes back online, matched by `sessionId`.
- More than 30 relays per room in 60 s auto-pauses the room. Resume flushes what's pending.

## Conventions

- Errors: throw `AgentHubError` subclasses. Each has an HTTP `status` plus `toResponse()` (Elysia's custom-error convention), so there is no `onError` hook to widen the route types. Use `catchError` / `catchErrorTyped` / `catchSync`, not try/catch.
- All DB access goes through the stores. The hub emits a single `event` stream (`HubEvent` union), which the server publishes to WS topic `hub`.
- Frontends never fetch inside components. They select from `createHubStore()` state and call its actions.
- The server binds to `127.0.0.1`. `plugins/guard.ts` enforces a loopback `Host` and a same-origin `Origin`. Keep that guard in front of every route.

## Scripts

```bash
bun run dev          # server, restarts on change (--watch; --hot would double-bind the sockets) — the user runs this; don't start it yourself
bun run tui
bun run typecheck    # bun check — must be zero errors
bun test             # protocol unit tests + fake-session end-to-end + HTTP (app.handle)
bun run db:generate  # drizzle-kit generate + embed migrations into src/db/embedded-migrations.ts
bun run build:local  # single binary for this platform
```
