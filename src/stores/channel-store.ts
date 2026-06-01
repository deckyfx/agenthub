import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { channels, agentChannels, agents } from "../db/schema";
import {
  ChannelNotFoundError,
  AliasConflictError,
  NotSubscribedError,
  AliasNotFoundError,
} from "../errors/custom-errors";
import type { Channel, NewChannel, AgentChannel } from "../db/schema";

/** A channel member plus its live presence from the agents table. */
export interface MemberWithPresence extends AgentChannel {
  status: string;
  status_note: string | null;
  last_heartbeat: number;
}

/** Repository for channel and subscription operations */
export class ChannelStore {
  /** Create a new channel */
  static async create(data: NewChannel): Promise<Channel> {
    const result = await db.insert(channels).values(data).returning();
    const channel = result[0];
    if (!channel) throw new Error("Failed to create channel");
    return channel;
  }

  /** Find channel by ID */
  static async findById(id: string): Promise<Channel | null> {
    const result = await db
      .select()
      .from(channels)
      .where(eq(channels.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Require channel by ID */
  static async requireById(id: string): Promise<Channel> {
    const channel = await this.findById(id);
    if (!channel) throw new ChannelNotFoundError(id);
    return channel;
  }

  /** Get all active (non-archived) channels */
  static async findAllActive(): Promise<Channel[]> {
    return db
      .select()
      .from(channels)
      .where(eq(channels.archived, 0));
  }

  /** Get all channels an agent is subscribed to */
  static async findByAgent(agentId: string): Promise<Channel[]> {
    const rows = await db
      .select({ channel: channels })
      .from(agentChannels)
      .innerJoin(channels, eq(agentChannels.channel_id, channels.id))
      .where(eq(agentChannels.agent_id, agentId));
    return rows.map((r) => r.channel);
  }

  /** Archive a channel */
  static async archive(id: string): Promise<void> {
    await db
      .update(channels)
      .set({ archived: 1 })
      .where(eq(channels.id, id));
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  /**
   * Subscribe an agent to a channel with alias and role.
   * @throws AliasConflictError if alias is already taken in this channel
   */
  static async join(
    agentId: string,
    channelId: string,
    alias: string,
    roleDescription?: string,
  ): Promise<AgentChannel> {
    await this.requireById(channelId);

    // Check alias uniqueness in channel
    const existing = await db
      .select()
      .from(agentChannels)
      .where(
        and(
          eq(agentChannels.channel_id, channelId),
          eq(agentChannels.alias, alias),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      // Allow re-join by same agent (idempotent)
      if (row && row.agent_id !== agentId) {
        throw new AliasConflictError(alias, channelId);
      }
    }

    const result = await db
      .insert(agentChannels)
      .values({ agent_id: agentId, channel_id: channelId, alias, role_description: roleDescription })
      .onConflictDoUpdate({
        target: [agentChannels.agent_id, agentChannels.channel_id],
        set: { alias, role_description: roleDescription },
      })
      .returning();

    const sub = result[0];
    if (!sub) throw new Error("Failed to join channel");
    return sub;
  }

  /** Unsubscribe an agent from a channel (releases alias) */
  static async leave(agentId: string, channelId: string): Promise<void> {
    await db
      .delete(agentChannels)
      .where(
        and(
          eq(agentChannels.agent_id, agentId),
          eq(agentChannels.channel_id, channelId),
        ),
      );
  }

  /** Get all subscriptions (members) for a channel */
  static async getMembers(channelId: string): Promise<AgentChannel[]> {
    return db
      .select()
      .from(agentChannels)
      .where(eq(agentChannels.channel_id, channelId));
  }

  /**
   * Get a channel's members enriched with live presence (status, status note,
   * and last heartbeat) from the agents table — for the dashboard rail and the
   * inbox peer roster.
   */
  static async getMembersWithPresence(channelId: string): Promise<MemberWithPresence[]> {
    return db
      .select({
        agent_id: agentChannels.agent_id,
        channel_id: agentChannels.channel_id,
        alias: agentChannels.alias,
        role_description: agentChannels.role_description,
        subscribed_at: agentChannels.subscribed_at,
        status: agents.status,
        status_note: agents.status_note,
        last_heartbeat: agents.last_heartbeat,
      })
      .from(agentChannels)
      .innerJoin(agents, eq(agentChannels.agent_id, agents.id))
      .where(eq(agentChannels.channel_id, channelId));
  }

  /** Get a single agent's subscription in a channel */
  static async getSubscription(
    agentId: string,
    channelId: string,
  ): Promise<AgentChannel | null> {
    const result = await db
      .select()
      .from(agentChannels)
      .where(
        and(
          eq(agentChannels.agent_id, agentId),
          eq(agentChannels.channel_id, channelId),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Resolve an @alias to agent_id within a channel.
   * @throws AliasNotFoundError if alias not found
   */
  static async resolveAlias(
    alias: string,
    channelId: string,
  ): Promise<string> {
    const result = await db
      .select({ agent_id: agentChannels.agent_id })
      .from(agentChannels)
      .where(
        and(
          eq(agentChannels.channel_id, channelId),
          eq(agentChannels.alias, alias),
        ),
      )
      .limit(1);

    const row = result[0];
    if (!row) throw new AliasNotFoundError(alias, channelId);
    return row.agent_id;
  }

  /**
   * Get the alias of an agent in a channel.
   * @throws NotSubscribedError if not subscribed
   */
  static async getAlias(agentId: string, channelId: string): Promise<string> {
    const sub = await this.getSubscription(agentId, channelId);
    if (!sub) throw new NotSubscribedError(agentId, channelId);
    return sub.alias;
  }
}
