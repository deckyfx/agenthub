import { MessageStore } from "../stores/message-store";
import { ContextStore } from "../stores/context-store";
import { ChannelStore } from "../stores/channel-store";
import { GroupStore } from "../stores/group-store";

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
