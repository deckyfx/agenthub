import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { deliveries, messages, type Delivery, type DeliveryStatus, type Message, type SenderKind } from "../db/schema";

/** A message plus its per-recipient delivery state. */
export interface MessageWithDeliveries extends Message {
  deliveries: Delivery[];
}

/** Repository for message history and fan-out delivery bookkeeping. */
export class MessageStore {
  /** Insert a message and a `pending` delivery row per recipient, atomically. */
  static create(input: {
    roomId: string | null;
    sessionId: string | null;
    senderKind: SenderKind;
    senderLabel: string;
    body: string;
    recipients: string[];
  }): MessageWithDeliveries {
    return db.transaction((tx) => {
      const { recipients, ...row } = input;
      const message = tx.insert(messages).values(row).returning().get();
      const rows =
        recipients.length > 0
          ? tx
              .insert(deliveries)
              .values(recipients.map((sessionId) => ({ messageId: message.id, sessionId })))
              .returning()
              .all()
          : [];
      return { ...message, deliveries: rows };
    });
  }

  static setDelivery(messageId: number, sessionId: string, status: DeliveryStatus, error?: string): void {
    db.update(deliveries)
      .set({ status, error: error ?? null, updatedAt: Date.now() })
      .where(and(eq(deliveries.messageId, messageId), eq(deliveries.sessionId, sessionId)))
      .run();
  }

  static get(id: number): MessageWithDeliveries | undefined {
    const message = db.select().from(messages).where(eq(messages.id, id)).get();
    if (!message) return undefined;
    return { ...message, deliveries: db.select().from(deliveries).where(eq(deliveries.messageId, id)).all() };
  }

  /** Attach delivery rows to a page of messages. */
  private static withDeliveries(page: Message[]): MessageWithDeliveries[] {
    if (page.length === 0) return [];
    const rows = db
      .select()
      .from(deliveries)
      .where(inArray(deliveries.messageId, page.map((m) => m.id)))
      .all();
    return page.map((m) => ({ ...m, deliveries: rows.filter((d) => d.messageId === m.id) }));
  }

  /** Latest messages of a room, oldest first. `before` pages backwards by id. */
  static forRoom(roomId: string, limit = 200, before?: number): MessageWithDeliveries[] {
    const where = before ? and(eq(messages.roomId, roomId), lt(messages.id, before)) : eq(messages.roomId, roomId);
    const page = db.select().from(messages).where(where).orderBy(desc(messages.id)).limit(limit).all();
    return this.withDeliveries(page.reverse());
  }

  /** Direct (non-room) thread with one session, oldest first. */
  static forDirect(sessionId: string, limit = 200, before?: number): MessageWithDeliveries[] {
    const base = and(isNull(messages.roomId), eq(messages.sessionId, sessionId));
    const where = before ? and(base, lt(messages.id, before)) : base;
    const page = db.select().from(messages).where(where).orderBy(desc(messages.id)).limit(limit).all();
    return this.withDeliveries(page.reverse());
  }

  /** Messages still waiting for `sessionId` to come online, oldest first. */
  static pendingFor(sessionId: string): Message[] {
    return db
      .select({ message: messages })
      .from(deliveries)
      .innerJoin(messages, eq(messages.id, deliveries.messageId))
      .where(and(eq(deliveries.sessionId, sessionId), eq(deliveries.status, "pending")))
      .orderBy(asc(messages.id))
      .all()
      .map((r) => r.message);
  }
}
