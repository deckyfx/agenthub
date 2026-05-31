import { GroupStore } from "../stores/group-store";

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
