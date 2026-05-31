import { AgentStore } from "../stores/agent-store";
import { ChannelStore } from "../stores/channel-store";
import type { AgentStatus } from "../stores/agent-store";

/**
 * agent:register — Register a new agent with the hub.
 * Idempotent: updates display_name and working_dir if agent already exists.
 */
export async function runAgentRegister(
  id: string,
  dir: string,
  name: string,
): Promise<void> {
  const agent = await AgentStore.upsert({
    id,
    display_name: name,
    working_dir: dir,
    status: "idle",
  });

  console.log(JSON.stringify({ ok: true, agent }));
}

/**
 * agent:heartbeat — Update agent status and last_heartbeat timestamp.
 * Should be called by agents at the start of every loop iteration.
 *
 * Identity is channel-scoped, so the caller is identified by (alias, channel)
 * and resolved to its per-channel agent id.
 *
 * @param alias - The agent's channel alias.
 * @param channelId - The channel the agent is working in.
 * @param status - The status to record.
 */
export async function runAgentHeartbeat(
  alias: string,
  channelId: string,
  status: AgentStatus,
): Promise<void> {
  const agentId = await ChannelStore.resolveAlias(alias, channelId);
  const agent = await AgentStore.heartbeat(agentId, status);
  console.log(JSON.stringify({ ok: true, agent }));
}
