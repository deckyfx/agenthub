import { MessageStore } from "../stores/message-store";
import { ContextStore } from "../stores/context-store";
import { ChannelStore } from "../stores/channel-store";
import { GroupStore } from "../stores/group-store";

/**
 * inbox:poll — Return all pending messages and unapplied context for an agent.
 *
 * Output format matches the PRD spec:
 * { messages: [...], context: [...], channel_members: [...] }
 */
export async function runInboxPoll(agentId: string): Promise<void> {
  // Get agent's group memberships for context targeting
  const groups = await GroupStore.getGroupsForAgent(agentId);
  const groupIds = groups.map((g) => g.id);

  const [msgs, ctxItems] = await Promise.all([
    MessageStore.pollForAgent(agentId),
    ContextStore.pollForAgent(agentId, groupIds),
  ]);

  // Get channel_members for all subscribed channels (gives agents peer context)
  const channels = await ChannelStore.findByAgent(agentId);
  const membersByChannel: Record<string, Array<{ alias: string; agent_id: string; role: string | null }>> = {};

  for (const ch of channels) {
    const subs = await ChannelStore.getMembers(ch.id);
    membersByChannel[ch.id] = subs.map((s) => ({
      alias: s.alias,
      agent_id: s.agent_id,
      role: s.role_description ?? null,
    }));
  }

  // Flatten channel_members as array (first channel, for backward compat)
  const channelMembers = Object.values(membersByChannel).flat();

  // Mark messages as read
  for (const msg of msgs) {
    if (msg.id) await MessageStore.markRead(msg.id);
  }

  const output = {
    messages: msgs,
    context: ctxItems,
    channel_members: channelMembers,
    channels: membersByChannel,
  };

  console.log(JSON.stringify(output));
}

/**
 * inbox:wait — Block until a new pending message arrives or timeout expires.
 *
 * Polls the DB every 1 second. This leverages Claude CLI's natural blocking
 * behavior — the agent genuinely idles while waiting.
 *
 * @param agentId - The agent to wait for
 * @param timeoutSeconds - Max seconds to wait before returning (default: 30)
 */
export async function runInboxWait(
  agentId: string,
  timeoutSeconds: number = 30,
): Promise<void> {
  const startTime = Date.now();
  const deadlineMs = startTime + timeoutSeconds * 1000;

  while (Date.now() < deadlineMs) {
    const hasNew = await MessageStore.hasPendingForAgent(agentId);
    if (hasNew) {
      console.log(JSON.stringify({ ok: true, reason: "message_arrived" }));
      return;
    }
    await Bun.sleep(1000);
  }

  console.log(JSON.stringify({ ok: true, reason: "timeout" }));
}
