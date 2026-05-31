import { eq } from "drizzle-orm";
import { db } from "../db";
import { agentGroups, agentGroupMembers, agents } from "../db/schema";
import { GroupNotFoundError } from "../errors/custom-errors";
import type { AgentGroup, NewAgentGroup, Agent } from "../db/schema";

/** Repository for agent group and membership operations */
export class GroupStore {
  /** Create a new project group */
  static async create(data: NewAgentGroup): Promise<AgentGroup> {
    const result = await db.insert(agentGroups).values(data).returning();
    const group = result[0];
    if (!group) throw new Error("Failed to create group");
    return group;
  }

  /**
   * Upsert a group by ID.
   * Creates it with display_name = id if it doesn't exist yet.
   * Called automatically when an agent joins a channel with --group.
   */
  static async upsert(data: Pick<NewAgentGroup, "id" | "display_name">): Promise<AgentGroup> {
    const result = await db
      .insert(agentGroups)
      .values({ id: data.id, display_name: data.display_name })
      .onConflictDoNothing()
      .returning();

    const created = result[0];
    if (created) return created;

    // Already existed — fetch it
    const existing = await this.findById(data.id);
    if (!existing) throw new Error(`Failed to upsert group '${data.id}'`);
    return existing;
  }

  /** Find group by ID */
  static async findById(id: string): Promise<AgentGroup | null> {
    const result = await db
      .select()
      .from(agentGroups)
      .where(eq(agentGroups.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Require group by ID */
  static async requireById(id: string): Promise<AgentGroup> {
    const group = await this.findById(id);
    if (!group) throw new GroupNotFoundError(id);
    return group;
  }

  /** Get all groups */
  static async findAll(): Promise<AgentGroup[]> {
    return db.select().from(agentGroups);
  }

  /**
   * Add an agent to a group (idempotent).
   * @throws GroupNotFoundError if group does not exist
   */
  static async addMember(groupId: string, agentId: string): Promise<void> {
    await this.requireById(groupId);
    await db
      .insert(agentGroupMembers)
      .values({ group_id: groupId, agent_id: agentId })
      .onConflictDoNothing();
  }

  /** Remove an agent from a group */
  static async removeMember(groupId: string, agentId: string): Promise<void> {
    await db
      .delete(agentGroupMembers)
      .where(
        eq(agentGroupMembers.group_id, groupId) &&
          eq(agentGroupMembers.agent_id, agentId),
      );
  }

  /** Get all agent IDs in a group */
  static async getMemberIds(groupId: string): Promise<string[]> {
    const rows = await db
      .select({ agent_id: agentGroupMembers.agent_id })
      .from(agentGroupMembers)
      .where(eq(agentGroupMembers.group_id, groupId));
    return rows.map((r) => r.agent_id);
  }

  /** Get full agent records for all members of a group */
  static async getMembers(groupId: string): Promise<Agent[]> {
    const rows = await db
      .select({ agent: agents })
      .from(agentGroupMembers)
      .innerJoin(agents, eq(agentGroupMembers.agent_id, agents.id))
      .where(eq(agentGroupMembers.group_id, groupId));
    return rows.map((r) => r.agent);
  }

  /** Get all groups an agent belongs to */
  static async getGroupsForAgent(agentId: string): Promise<AgentGroup[]> {
    const rows = await db
      .select({ group: agentGroups })
      .from(agentGroupMembers)
      .innerJoin(agentGroups, eq(agentGroupMembers.group_id, agentGroups.id))
      .where(eq(agentGroupMembers.agent_id, agentId));
    return rows.map((r) => r.group);
  }
}
