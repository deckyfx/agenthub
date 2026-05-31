import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { contextInjections } from "../db/schema";
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
   * Get unapplied context relevant to an agent *within one channel*.
   *
   * Channel-scoped: only injections for this channel (or channel-less direct
   * injections) are considered, so the same alias in another channel never sees
   * this channel's context. Matches when `target_agent` is any of:
   * - the resolved agentId
   * - the bare alias, or the `@alias` form
   * - `'all'`
   * - `group:<id>` for a group the agent belongs to (ids passed in)
   *
   * @param channelId - Channel being polled.
   * @param agentId - The agent's resolved id (for agentId-form targets).
   * @param alias - The agent's channel alias (for alias / @alias targets).
   * @param groupIds - The agent's group ids (for group:<id> targets).
   */
  static async pollForChannelAgent(
    channelId: string,
    agentId: string,
    alias: string,
    groupIds: string[] = [],
  ): Promise<ContextInjection[]> {
    const targets = new Set([
      agentId,
      alias,
      `@${alias}`,
      "all",
      ...groupIds.map((g) => `group:${g}`),
    ]);

    // Unapplied injections for this channel, or channel-less direct injections.
    const all = await db
      .select()
      .from(contextInjections)
      .where(
        and(
          isNull(contextInjections.applied_at),
          or(
            eq(contextInjections.channel_id, channelId),
            isNull(contextInjections.channel_id),
          ),
        ),
      )
      .orderBy(contextInjections.created_at);

    return all.filter((c) => targets.has(c.target_agent));
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
