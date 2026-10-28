import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** A room groups sessions (often from different repos) around one piece of work. */
export const rooms = sqliteTable("rooms", {
  /** URL/prompt-safe slug, e.g. `checkout-feature`. Agents address it as `#slug`. */
  id: text("id").primaryKey(),
  topic: text("topic").notNull().default(""),
  /** Background briefing sent to every member when they join. */
  context: text("context").notNull().default(""),
  /** Paused rooms log inbound messages but do not fan them out. */
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

/**
 * Session membership. Keyed by Claude Code's `sessionId` (stable across
 * restarts and `--resume`), not the pid.
 */
export const roomMembers = sqliteTable(
  "room_members",
  {
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    /** In-room handle (`@alias`), unique per room. */
    alias: text("alias").notNull(),
    /** Last seen session name / cwd, for display while offline. */
    name: text("name").notNull().default(""),
    cwd: text("cwd").notNull().default(""),
    joinedAt: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.sessionId] }), uniqueIndex("room_alias_uq").on(t.roomId, t.alias)],
);

/** Who authored a message. */
export type SenderKind = "operator" | "session" | "hub";

/**
 * Every relayed message. `roomId` null = a direct thread between the operator
 * and `sessionId`. For room messages `sessionId` is the sending session (if any).
 */
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    senderKind: text("sender_kind").$type<SenderKind>().notNull(),
    senderLabel: text("sender_label").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("messages_room_idx").on(t.roomId, t.id), index("messages_session_idx").on(t.sessionId, t.id)],
);

/** Per-recipient delivery state of a message. */
export type DeliveryStatus = "pending" | "sent" | "failed";

/** Fan-out bookkeeping: one row per (message, recipient session). */
export const deliveries = sqliteTable(
  "deliveries",
  {
    messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    error: text("error"),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.sessionId] }), index("deliveries_pending_idx").on(t.sessionId, t.status)],
);

export type Room = typeof rooms.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
