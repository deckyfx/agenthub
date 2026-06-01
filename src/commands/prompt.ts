import { ChannelStore } from "../stores/channel-store";
import { AgentStore } from "../stores/agent-store";
import { GroupStore } from "../stores/group-store";
import { ContextStore } from "../stores/context-store";
import { buildAgentPrompt } from "../server/agent-prompt";
import { AliasNotFoundError } from "../errors/custom-errors";

/**
 * Rebuild an agent's onboarding/join prompt from persisted state.
 *
 * This is the single reconstruction routine shared by the dashboard API and the
 * `agenthub prompt` CLI command, so a re-displayed prompt always matches the
 * original. Returns `null` when the channel or membership no longer exists.
 *
 * @param channelId - Channel the agent belongs to.
 * @param idOrAlias - The member's channel-scoped agent id *or* its alias (the
 *   invite flow knows only the alias; the member list knows the agent id).
 * @returns The rebuilt prompt and the member's alias, or null if not found.
 */
export async function reconstructPrompt(
  channelId: string,
  idOrAlias: string,
): Promise<{ prompt: string; alias: string } | null> {
  const channel = await ChannelStore.findById(channelId);
  if (!channel) return null;

  // Identity is channel-scoped, so the member may be addressed by either its
  // (compound) agent id or its alias — resolve both here.
  const members = await ChannelStore.getMembers(channelId);
  const sub = members.find((m) => m.agent_id === idOrAlias || m.alias === idOrAlias);
  if (!sub) return null;

  const agentId = sub.agent_id;
  const agent = await AgentStore.findById(agentId);
  const groups = await GroupStore.getGroupsForAgent(agentId);

  // Channel context targeted specifically at this agent, in any of the forms the
  // injector may have used (agent id, bare alias, or @alias).
  const channelContext = await ContextStore.findByChannel(channelId);
  const targets = new Set([agentId, sub.alias, `@${sub.alias}`]);
  const extraContext = channelContext
    .filter((c) => targets.has(c.target_agent))
    .map((c) => c.content)
    .join("\n\n");

  const prompt = buildAgentPrompt({
    alias: sub.alias,
    channelId,
    channelTopic: channel.topic,
    role: sub.role_description ?? undefined,
    group: groups[0]?.id,
    workingDir: agent?.working_dir || undefined,
    extraContext: extraContext || undefined,
    summary: channel.summary ?? undefined,
  });

  return { prompt, alias: sub.alias };
}

/**
 * prompt — Print an agent's join prompt so a (replacement) agent can execute the
 * command and follow the instructions directly.
 *
 * Unlike the other commands this prints the prompt as raw text (not JSON): its
 * whole purpose is to be read and acted on by the agent that runs it.
 *
 * @example
 *   agenthub prompt --channel ch-auth --alias bon
 */
export async function runPromptShow(channelId: string, alias: string): Promise<void> {
  // Resolve the alias to its agent within the channel (throws if absent).
  const agentId = await ChannelStore.resolveAlias(alias, channelId);
  const result = await reconstructPrompt(channelId, agentId);
  if (!result) throw new AliasNotFoundError(alias, channelId);
  console.log(result.prompt);
}
