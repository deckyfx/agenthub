import { AgentStore } from "../stores/agent-store";
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
 */
export async function runAgentHeartbeat(
  id: string,
  status: AgentStatus,
): Promise<void> {
  const agent = await AgentStore.heartbeat(id, status);
  console.log(JSON.stringify({ ok: true, agent }));
}
