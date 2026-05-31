import { GroupStore } from "../stores/group-store";
import { MessageStore } from "../stores/message-store";
import { ChannelStore } from "../stores/channel-store";
import type { MessageType } from "../stores/message-store";

/** group:create — Create a new project group */
export async function runGroupCreate(
  id: string,
  name: string,
  description?: string,
): Promise<void> {
  const group = await GroupStore.create({ id, display_name: name, description });
  console.log(JSON.stringify({ ok: true, group }));
}

/** group:add — Add an agent to a group */
export async function runGroupAdd(
  groupId: string,
  agentId: string,
): Promise<void> {
  await GroupStore.addMember(groupId, agentId);
  console.log(JSON.stringify({ ok: true }));
}

/** group:members — List all agents in a group */
export async function runGroupMembers(groupId: string): Promise<void> {
  const members = await GroupStore.getMembers(groupId);
  console.log(JSON.stringify({ ok: true, members }));
}

/**
 * Fan-out a message to all agents in a group.
 * Expands --to-group to individual message:send calls per member.
 */
export async function runGroupBroadcastMessage(
  fromAgent: string,
  groupId: string,
  channelId: string,
  type: MessageType,
  payload: string,
): Promise<void> {
  const memberIds = await GroupStore.getMemberIds(groupId);

  const sent: number[] = [];
  for (const agentId of memberIds) {
    const sub = await ChannelStore.getSubscription(fromAgent, channelId);
    const fromAlias = sub?.alias;

    const msg = await MessageStore.send({
      channel_id: channelId,
      from_agent: fromAgent,
      from_alias: fromAlias,
      to_agent: agentId,
      type,
      payload,
    });
    sent.push(msg.id);
  }

  console.log(JSON.stringify({ ok: true, sent_count: sent.length, message_ids: sent }));
}
