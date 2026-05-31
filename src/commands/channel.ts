import { ChannelStore } from "../stores/channel-store";
import { GroupStore } from "../stores/group-store";
import { AgentStore } from "../stores/agent-store";

/** channel:create — Create a new channel */
export async function runChannelCreate(
  id: string,
  topic: string,
  createdBy: string = "moderator",
): Promise<void> {
  const channel = await ChannelStore.create({ id, topic, created_by: createdBy });
  console.log(JSON.stringify({ ok: true, channel }));
}

/**
 * channel:join — Subscribe an agent to a channel with alias and role.
 *
 * If --group is provided, the group and the agent's membership are upserted
 * automatically — no prior group:create or group:add needed.
 *
 * Example:
 *   agenthub channel:join --agent crm-backend --channel ch-auth \
 *     --alias bon --role "Backend API agent" --group crm
 */
export async function runChannelJoin(
  agentId: string | undefined,
  channelId: string,
  alias: string,
  role?: string,
  groupId?: string,
): Promise<void> {
  // Identity is channel-scoped: the same alias in two channels is two different
  // agents. Unless an explicit --agent id is given, derive a per-channel id so
  // their status / working_dir / group memberships never collapse together.
  const id = agentId?.trim() || `${channelId}::${alias.trim()}`;

  // Auto-register the agent so join is the only setup step needed. Preserve any
  // working_dir already recorded for this identity (e.g. set when invited from
  // the dashboard) so re-joining doesn't wipe it.
  const existing = await AgentStore.findById(id);
  await AgentStore.upsert({
    id,
    display_name: alias.trim(),
    working_dir: existing?.working_dir ?? "",
    status: "idle",
  });

  // Auto-upsert group and membership when --group is given
  if (groupId) {
    await GroupStore.upsert({ id: groupId, display_name: groupId });
    await GroupStore.addMember(groupId, id);
  }

  const sub = await ChannelStore.join(id, channelId, alias, role);
  console.log(JSON.stringify({ ok: true, subscription: sub, group: groupId ?? null }));
}

/** channel:leave — Unsubscribe an agent from a channel (releases its alias) */
export async function runChannelLeave(
  aliasOrId: string,
  channelId: string,
): Promise<void> {
  // Accept either the channel alias or the raw (channel-scoped) agent id.
  const members = await ChannelStore.getMembers(channelId);
  const match = members.find((m) => m.alias === aliasOrId || m.agent_id === aliasOrId);
  await ChannelStore.leave(match?.agent_id ?? aliasOrId, channelId);
  console.log(JSON.stringify({ ok: true }));
}

/** channel:list — List all channels an agent is subscribed to */
export async function runChannelList(agentId: string): Promise<void> {
  const channels = await ChannelStore.findByAgent(agentId);
  console.log(JSON.stringify({ ok: true, channels }));
}

/** channel:members — List all agents (with aliases and roles) in a channel */
export async function runChannelMembers(channelId: string): Promise<void> {
  const members = await ChannelStore.getMembers(channelId);
  console.log(JSON.stringify({ ok: true, members }));
}
