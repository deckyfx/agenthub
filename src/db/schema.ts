import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  unique,
} from "drizzle-orm/sqlite-core";
import { sql, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// ─── Agents ──────────────────────────────────────────────────────────────────

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  display_name: text("display_name").notNull(),
  /** idle | working | waiting | blocked | done */
  status: text("status").notNull().default("idle"),
  working_dir: text("working_dir").notNull(),
  last_heartbeat: integer("last_heartbeat")
    .notNull()
    .default(sql`(unixepoch())`),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Agent = InferSelectModel<typeof agents>;
export type NewAgent = InferInsertModel<typeof agents>;

// ─── Channels ─────────────────────────────────────────────────────────────────

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  created_by: text("created_by").notNull(),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  /** 0 = active, 1 = archived */
  archived: integer("archived").notNull().default(0),
});

export type Channel = InferSelectModel<typeof channels>;
export type NewChannel = InferInsertModel<typeof channels>;

// ─── Agent Groups ─────────────────────────────────────────────────────────────

export const agentGroups = sqliteTable("agent_groups", {
  id: text("id").primaryKey(),
  display_name: text("display_name").notNull(),
  description: text("description"),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export type AgentGroup = InferSelectModel<typeof agentGroups>;
export type NewAgentGroup = InferInsertModel<typeof agentGroups>;

// ─── Agent Group Members ──────────────────────────────────────────────────────

export const agentGroupMembers = sqliteTable(
  "agent_group_members",
  {
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    group_id: text("group_id")
      .notNull()
      .references(() => agentGroups.id),
    joined_at: integer("joined_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.agent_id, table.group_id] })],
);

export type AgentGroupMember = InferSelectModel<typeof agentGroupMembers>;
export type NewAgentGroupMember = InferInsertModel<typeof agentGroupMembers>;

// ─── Agent Channels (subscriptions) ──────────────────────────────────────────

export const agentChannels = sqliteTable(
  "agent_channels",
  {
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    channel_id: text("channel_id")
      .notNull()
      .references(() => channels.id),
    /** Channel-scoped human-readable alias (without @) */
    alias: text("alias").notNull(),
    role_description: text("role_description"),
    subscribed_at: integer("subscribed_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    primaryKey({ columns: [table.agent_id, table.channel_id] }),
    // Aliases must be unique within a channel
    unique("uq_channel_alias").on(table.channel_id, table.alias),
  ],
);

export type AgentChannel = InferSelectModel<typeof agentChannels>;
export type NewAgentChannel = InferInsertModel<typeof agentChannels>;

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel_id: text("channel_id")
    .notNull()
    .references(() => channels.id),
  from_agent: text("from_agent").notNull(),
  from_alias: text("from_alias"),
  /** Null = channel broadcast */
  to_agent: text("to_agent"),
  /** 'all' for broadcast, alias name otherwise */
  to_alias: text("to_alias"),
  /** task | result | question | answer | command | context | status */
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  /** pending | read | done */
  status: text("status").notNull().default("pending"),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  read_at: integer("read_at"),
  done_at: integer("done_at"),
});

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

// ─── Context Injections ───────────────────────────────────────────────────────

export const contextInjections = sqliteTable("context", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Null = direct injection without channel scope */
  channel_id: text("channel_id"),
  /** Agent ID, @alias, group:<group_id>, or 'all' */
  target_agent: text("target_agent").notNull(),
  content: text("content").notNull(),
  injected_by: text("injected_by").notNull().default("moderator"),
  /** normal | urgent */
  priority: text("priority").notNull().default("normal"),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  applied_by: text("applied_by"),
  applied_at: integer("applied_at"),
});

export type ContextInjection = InferSelectModel<typeof contextInjections>;
export type NewContextInjection = InferInsertModel<typeof contextInjections>;
