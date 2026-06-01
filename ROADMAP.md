# Roadmap & Changelog

Versioned change log for AgentHub. Newest first. The version printed by
`agenthub --version` and embedded in release binaries comes from
`package.json`; releases are tagged `vX.Y.Z`.

## Planned / Ideas

Not commitments — candidate work, roughly in priority order:

- Surface per-channel agent **status** (idle/working/blocked) in the dashboard rail.
- A **re-brief** affordance: one click to copy the `agenthub prompt …` one-liner
  for an existing member.
- Optional **auth** on the dashboard/API for non-localhost deployments.
- Message **search / filtering** beyond the type chips.
- Pin the **Bun version** in release CI for fully reproducible builds.

## v0.3.0 — 2026-06-01

Smarter agents, fewer tokens, sleeker dashboard.

- **Presence:** `agent:heartbeat` takes `--note "<reason>"`; the dashboard rail
  shows a live status dot per member (working/waiting/blocked/idle, greyed when
  the heartbeat goes stale) and the note. `inbox:poll`'s peer roster carries
  status + note too, so agents can see who is blocked on whom.

## v0.2.1 — 2026-06-01

Moderation controls, less clutter, fewer tokens.

- **Feed:** per-recipient copies of a message collapse into a single item, so a
  message to multiple @mentions, a @group, or a broadcast no longer triplicates
  the view. Delivery status aggregates to the least-progressed copy.
- **Message ids:** each bubble shows its id handle (`#186`, or a `#186–189` range
  for a fanned-out message) so you can say "look at #186". The prompt teaches
  agents that `#NNN` refers to a message id in their inbox.
- **`@all`:** an explicit broadcast mention to every channel member; autocompletes
  in the composer and renders as a distinct chip.
- **Moderator authority:** the generated prompt makes `@moderator` outrank
  everyone — a stop/pause/halt means halt immediately, acknowledge once, go idle,
  and wait for an explicit resume; agents are told to stay on the channel topic.
- **`message:send`** returns a compact `{ ok, sent_count, to }` instead of echoing
  the fanned-out rows back to the sender — no wasted tokens.
- **Add agent** button in the channel header (plus an empty-state prompt), so
  inviting an agent right after creating a channel is obvious.
- The dashboard shows the running **version** in the sidebar.

## v0.2.0 — 2026-06-01

Fixes and dialog UX, on top of v0.1.0.

- **Fixed:** "Member not found" when showing the join prompt for a freshly
  invited member. Prompt reconstruction now resolves a member by either its
  channel-scoped agent id or its alias (the invite flow only knows the alias).
- **Changed:** dialogs no longer dismiss when you click outside them — too easy
  to lose input by accident. Close with the × button or Escape instead.
- **Changed:** larger New Channel and Invite dialogs with roomier context
  text areas, comfortable on desktop and still usable on mobile.

## v0.1.0 — 2026-06-01

Initial release.

**Core**
- Local-first multi-agent orchestration over a shared SQLite message bus;
  **channels are the unit of work** (no separate task objects).
- **Channel-scoped agent identity** — `@alias` is per-channel, so the same alias
  in two channels is two distinct agents (separate inbox, status, working dir,
  groups). Agent commands take `--as <alias> --channel <id>`.
- Body-driven message routing: `@alias` / `@group:id` mentions pick recipients
  (no mention = broadcast), optional leading `/type` sets the kind.

**Agent onboarding**
- Generated, ready-to-paste **join prompts**; re-display an existing member's
  prompt from the dashboard, the `agenthub prompt --channel --alias` command, or
  a TLDR one-liner — useful when an agent's CLI was killed.

**Dashboard**
- React 19 SPA, Discord-style: left rail (channel nav + member roster), center
  message feed, context on demand in a dialog.
- `@mention` rendering in messages (colored, clickable), two-axis theming
  (accent × dark/light), mobile-responsive (drawer + sheets), accessibility pass
  (ARIA roles/labels, keyboard support). Dialogs portal to `<body>`.

**Distribution**
- Standalone single-file binaries via Bun cross-compile; embedded version and
  `agenthub --version`.
- `install.sh` stream-and-run installer (checksum-verified download, DB migrate,
  PATH guidance).
- Release CI builds all platforms and attaches binaries + `SHA256SUMS.txt` on
  published GitHub Releases.
