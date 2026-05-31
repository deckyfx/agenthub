import { and, eq, inArray, isNull, or, SQL } from "drizzle-orm";
import { db } from "../db";
import { messages, agentChannels } from "../db/schema";
import type { Message, NewMessage } from "../db/schema";

/**
 * Condition that matches messages addressed to `agentId` or broadcast.
 * Handles all storage variants:
 *   - to_agent = agentId          (direct message)
 *   - to_agent IS NULL            (broadcast, CLI path)
 *   - to_agent = ''               (broadcast, empty string from dashboard)
 *   - to_alias = 'all'            (broadcast, explicit dashboard path)
 */
function forAgent(agentId: string): SQL {
  return or(
    eq(messages.to_agent, agentId),
    isNull(messages.to_agent),
    eq(messages.to_agent, ""),
    eq(messages.to_alias, "all"),
  )!;
}

export type MessageType =
  | "task"
  | "result"
  | "question"
  | "answer"
  | "command"
  | "context"
  | "status";

/** Repository for message operations */
export class MessageStore {
  /** Send a message to a channel */
  static async send(data: NewMessage): Promise<Message> {
    const result = await db.insert(messages).values(data).returning();
    const msg = result[0];
    if (!msg) throw new Error("Failed to send message");
    return msg;
  }

  /** Find message by ID */
  static async findById(id: number): Promise<Message | null> {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Poll unread messages for an agent.
   * Returns all pending messages from subscribed channels
   * that are addressed to this agent or broadcast (to_agent = null).
   */
  static async pollForAgent(agentId: string): Promise<Message[]> {
    // Get agent's subscribed channel IDs
    const subs = await db
      .select({ channel_id: agentChannels.channel_id })
      .from(agentChannels)
      .where(eq(agentChannels.agent_id, agentId));

    if (subs.length === 0) return [];

    const channelIds = subs.map((s) => s.channel_id);

    return db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.channel_id, channelIds),
          eq(messages.status, "pending"),
          forAgent(agentId),
        ),
      )
      .orderBy(messages.created_at);
  }

  /** Mark a message as read */
  static async markRead(id: number): Promise<void> {
    await db
      .update(messages)
      .set({ status: "read", read_at: Math.floor(Date.now() / 1000) })
      .where(eq(messages.id, id));
  }

  /** Mark a message as done */
  static async markDone(id: number): Promise<void> {
    await db
      .update(messages)
      .set({ status: "done", done_at: Math.floor(Date.now() / 1000) })
      .where(eq(messages.id, id));
  }

  /** Get all messages in a channel (for dashboard) */
  static async findByChannel(channelId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.channel_id, channelId))
      .orderBy(messages.created_at);
  }

  /** Get all messages for a specific agent across channels (for dashboard) */
  static async findByAgent(agentId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(
        or(eq(messages.from_agent, agentId), eq(messages.to_agent, agentId)),
      )
      .orderBy(messages.created_at);
  }

  /**
   * Check if any new pending message has arrived for the agent
   * since a given timestamp. Used by inbox:wait polling loop.
   */
  static async hasNewMessageSince(
    agentId: string,
    since: number,
  ): Promise<boolean> {
    const subs = await db
      .select({ channel_id: agentChannels.channel_id })
      .from(agentChannels)
      .where(eq(agentChannels.agent_id, agentId));

    if (subs.length === 0) return false;

    const channelIds = subs.map((s) => s.channel_id);

    const result = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          inArray(messages.channel_id, channelIds),
          eq(messages.status, "pending"),
          forAgent(agentId),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}
