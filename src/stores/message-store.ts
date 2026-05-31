import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { messages, agentChannels } from "../db/schema";
import type { Message, NewMessage } from "../db/schema";

// Re-export the message-type vocabulary from the shared parser so existing
// imports (`import type { MessageType } from "../stores/message-store"`) keep working.
export type { MessageType } from "../lib/message-parse";

/**
 * Repository for message operations.
 *
 * Routing is alias based: recipients are resolved at send time (broadcasts and
 * groups are expanded to one row per member), so `messages.to_alias` always
 * holds the concrete recipient alias and matching here is a simple equality.
 */
export class MessageStore {
  /** Insert a message row. */
  static async send(data: NewMessage): Promise<Message> {
    const result = await db.insert(messages).values(data).returning();
    const msg = result[0];
    if (!msg) throw new Error("Failed to send message");
    return msg;
  }

  /** Find a message by its numeric id. */
  static async findById(id: number): Promise<Message | null> {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Poll pending messages addressed to an agent.
   *
   * @param alias - The polling agent's alias (its identity in this model).
   */
  static async pollForAgent(alias: string): Promise<Message[]> {
    const channelIds = await subscribedChannelIds(alias);
    if (channelIds.length === 0) return [];

    return db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.channel_id, channelIds),
          eq(messages.status, "pending"),
          eq(messages.to_alias, alias),
        ),
      )
      .orderBy(messages.created_at);
  }

  /** Mark a message as read (sets status + read_at). */
  static async markRead(id: number): Promise<void> {
    await db
      .update(messages)
      .set({ status: "read", read_at: Math.floor(Date.now() / 1000) })
      .where(eq(messages.id, id));
  }

  /** Mark a message as done (sets status + done_at). */
  static async markDone(id: number): Promise<void> {
    await db
      .update(messages)
      .set({ status: "done", done_at: Math.floor(Date.now() / 1000) })
      .where(eq(messages.id, id));
  }

  /**
   * Acknowledge the messages an observer (the dashboard "moderator") sees in a
   * channel feed, flipping them `pending` → `read`.
   *
   * The moderator never runs `inbox:poll`, so messages addressed to it — and
   * broadcast/feed rows with no concrete recipient (`to_alias IS NULL`) — would
   * otherwise stay `pending` forever. Messages addressed to a real agent are left
   * untouched so that agent still picks them up via its own poll.
   *
   * @param channelId - Channel being viewed.
   * @param observer - The observer alias (the dashboard sender, e.g. "moderator").
   */
  static async markChannelReadForObserver(
    channelId: string,
    observer: string,
  ): Promise<void> {
    await db
      .update(messages)
      .set({ status: "read", read_at: Math.floor(Date.now() / 1000) })
      .where(
        and(
          eq(messages.channel_id, channelId),
          eq(messages.status, "pending"),
          or(eq(messages.to_alias, observer), isNull(messages.to_alias)),
        ),
      );
  }

  /** Get every message in a channel (dashboard feed). */
  static async findByChannel(channelId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.channel_id, channelId))
      .orderBy(messages.created_at);
  }

  /** Get every message an agent sent or received, across channels (dashboard). */
  static async findByAgent(alias: string): Promise<Message[]> {
    const channelIds = await subscribedChannelIds(alias);
    if (channelIds.length === 0) return [];

    return db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.channel_id, channelIds),
          or(eq(messages.from_alias, alias), eq(messages.to_alias, alias)),
        ),
      )
      .orderBy(messages.created_at);
  }

  /**
   * Whether any pending message is waiting for the agent. Backs `inbox:wait`.
   *
   * @param alias - The waiting agent's alias.
   */
  static async hasPendingForAgent(alias: string): Promise<boolean> {
    const channelIds = await subscribedChannelIds(alias);
    if (channelIds.length === 0) return false;

    const result = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          inArray(messages.channel_id, channelIds),
          eq(messages.status, "pending"),
          eq(messages.to_alias, alias),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}

/** Channel ids the agent (by alias = agent id) is subscribed to. */
async function subscribedChannelIds(alias: string): Promise<string[]> {
  const subs = await db
    .select({ channel_id: agentChannels.channel_id })
    .from(agentChannels)
    .where(eq(agentChannels.agent_id, alias));
  return subs.map((s) => s.channel_id);
}
