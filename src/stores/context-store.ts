import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { contextInjections, agentChannels } from "../db/schema";
import type { ContextInjection, NewContextInjection } from "../db/schema";

/** Repository for context injection operations */
export class ContextStore {
  /** Inject context targeting an agent, alias, group, or 'all' */
  static async inject(data: NewContextInjection): Promise<ContextInjection> {
    const result = await db
      .insert(contextInjections)
      .values(data)
      .returning();
    const ctx = result[0];
    if (!ctx) throw new Error("Failed to inject context");
    return ctx;
  }

  /**
   * Get all unapplied context injections relevant to an agent.
   * Matches:
   * - target_agent = agentId
   * - target_agent = 'all'
   * - target_agent = @alias (resolved from agent's channel subscriptions)
   * - target_agent = group:<group_id> (handled by caller — group IDs passed in)
   */
  static async pollForAgent(
    agentId: string,
    groupIds: string[] = [],
  ): Promise<ContextInjection[]> {
    // Build target_agent candidates: agentId, 'all', group:<id> variants
    const targets = [agentId, "all", ...groupIds.map((g) => `group:${g}`)];

    // Also get aliases for this agent across channels
    const subs = await db
      .select({ alias: agentChannels.alias, channel_id: agentChannels.channel_id })
      .from(agentChannels)
      .where(eq(agentChannels.agent_id, agentId));

    // @alias form
    const aliasTargets = subs.map((s) => `@${s.alias}`);

    const allTargets = [...targets, ...aliasTargets];

    // Fetch unapplied injections matching any target
    const all = await db
      .select()
      .from(contextInjections)
      .where(isNull(contextInjections.applied_at))
      .orderBy(contextInjections.created_at);

    return all.filter((c) => allTargets.includes(c.target_agent));
  }

  /** Mark a context injection as applied by an agent */
  static async markApplied(id: number, agentId: string): Promise<void> {
    await db
      .update(contextInjections)
      .set({
        applied_by: agentId,
        applied_at: Math.floor(Date.now() / 1000),
      })
      .where(eq(contextInjections.id, id));
  }

  /** Get all context injections (for dashboard) */
  static async findAll(): Promise<ContextInjection[]> {
    return db
      .select()
      .from(contextInjections)
      .orderBy(contextInjections.created_at);
  }

  /** Get injections for a specific channel (for dashboard) */
  static async findByChannel(channelId: string): Promise<ContextInjection[]> {
    return db
      .select()
      .from(contextInjections)
      .where(eq(contextInjections.channel_id, channelId))
      .orderBy(contextInjections.created_at);
  }
}
