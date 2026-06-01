import { MessageStore } from "../stores/message-store";
import { ContextStore } from "../stores/context-store";
import { ChannelStore } from "../stores/channel-store";
import { GroupStore } from "../stores/group-store";
import { AgentStore, type AgentStatus } from "../stores/agent-store";
import type { MemberWithPresence } from "../stores/channel-store";

/**
 * Short, stable hash of a channel's *membership* (aliases + roles), so an agent
 * can tell whether the roster changed since its last tick. Deliberately ignores
 * live status — the roster is only re-sent when someone joins/leaves, which is
 * what saves tokens on a busy channel.
 */
function membersVersion(members: MemberWithPresence[]): string {
  const key = members
    .map((m) => `${m.alias}:${m.role_description ?? ""}`)
    .sort()
    .join("|");
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * inbox:poll — Return pending messages, unapplied context, and the member
 * roster for an alias *within a single channel*.
 *
 * Identity is channel-scoped: `@bob` in two channels is two different agents,
 * so polling is bounded to (channel, alias) and never bleeds across channels.
 *
 * @param alias - The polling agent's channel alias.
 * @param channelId - The channel to poll.
 */
export async function runInboxPoll(alias: string, channelId: string): Promise<void> {
  // Resolve the channel-scoped identity (throws if the alias hasn't joined).
  const agentId = await ChannelStore.resolveAlias(alias, channelId);

  const groups = await GroupStore.getGroupsForAgent(agentId);
  const groupIds = groups.map((g) => g.id);

  const [msgs, ctxItems] = await Promise.all([
    MessageStore.pollForChannelAlias(channelId, alias),
    ContextStore.pollForChannelAgent(channelId, agentId, alias, groupIds),
  ]);

  const subs = await ChannelStore.getMembersWithPresence(channelId);
  const channelMembers = subs.map((s) => ({
    alias: s.alias,
    agent_id: s.agent_id,
    role: s.role_description ?? null,
    status: s.status,
    status_note: s.status_note ?? null,
  }));

  // Mark messages as read
  for (const msg of msgs) {
    if (msg.id) await MessageStore.markRead(msg.id);
  }

  console.log(
    JSON.stringify({
      messages: msgs,
      context: ctxItems,
      channel_members: channelMembers,
      channel: channelId,
    }),
  );
}

/**
 * agent:tick — One call that heartbeats AND polls, for a token-lean work loop.
 *
 * Combines `agent:heartbeat` + `inbox:poll` so each loop iteration is a single
 * command. The member roster is only included when it changed since the agent's
 * last tick (compared via `members_version`); otherwise `channel_members` is
 * null and the agent reuses its cached roster — the main token saving on a busy
 * channel.
 *
 * @param alias - The agent's channel alias.
 * @param channelId - The channel to tick.
 * @param opts - status (default "working"), optional note, and the
 *   members_version the agent last received.
 */
export async function runAgentTick(
  alias: string,
  channelId: string,
  opts: { status?: AgentStatus; note?: string; membersVersion?: string },
): Promise<void> {
  const agentId = await ChannelStore.resolveAlias(alias, channelId);
  await AgentStore.heartbeat(agentId, opts.status ?? "working", opts.note);

  const groups = await GroupStore.getGroupsForAgent(agentId);
  const groupIds = groups.map((g) => g.id);

  const [msgs, ctxItems] = await Promise.all([
    MessageStore.pollForChannelAlias(channelId, alias),
    ContextStore.pollForChannelAgent(channelId, agentId, alias, groupIds),
  ]);
  for (const msg of msgs) if (msg.id) await MessageStore.markRead(msg.id);

  const subs = await ChannelStore.getMembersWithPresence(channelId);
  const version = membersVersion(subs);
  const rosterChanged = opts.membersVersion !== version;
  const channelMembers = rosterChanged
    ? subs.map((s) => ({
        alias: s.alias,
        agent_id: s.agent_id,
        role: s.role_description ?? null,
        status: s.status,
        status_note: s.status_note ?? null,
      }))
    : null;

  console.log(
    JSON.stringify({
      messages: msgs,
      context: ctxItems,
      members_version: version,
      channel_members: channelMembers,
      channel: channelId,
    }),
  );
}

/**
 * inbox:wait — Block until a new pending message arrives or timeout expires.
 *
 * Polls the DB every 1 second. This leverages Claude CLI's natural blocking
 * behavior — the agent genuinely idles while waiting.
 *
 * @param alias - The waiting agent's channel alias.
 * @param channelId - The channel to wait on.
 * @param timeoutSeconds - Max seconds to wait before returning (default: 30)
 */
export async function runInboxWait(
  alias: string,
  channelId: string,
  timeoutSeconds: number = 30,
): Promise<void> {
  const startTime = Date.now();
  const deadlineMs = startTime + timeoutSeconds * 1000;

  while (Date.now() < deadlineMs) {
    const hasNew = await MessageStore.hasPendingForChannelAlias(channelId, alias);
    if (hasNew) {
      console.log(JSON.stringify({ ok: true, reason: "message_arrived" }));
      return;
    }
    await Bun.sleep(1000);
  }

  console.log(JSON.stringify({ ok: true, reason: "timeout" }));
}
