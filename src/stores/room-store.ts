import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { roomMembers, rooms, type Room, type RoomMember } from "../db/schema";
import { ConflictError, RoomNotFoundError } from "../errors/custom-errors";

/** Turn free text into a room slug / alias: lowercase, `a-z0-9-`, ≤ 40 chars. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Repository for rooms and their membership. */
export class RoomStore {
  /** All rooms, oldest first. */
  static list(): Room[] {
    return db.select().from(rooms).orderBy(asc(rooms.createdAt)).all();
  }

  static find(id: string): Room | undefined {
    return db.select().from(rooms).where(eq(rooms.id, id)).get();
  }

  /** @throws RoomNotFoundError */
  static get(id: string): Room {
    const room = this.find(id);
    if (!room) throw new RoomNotFoundError(id);
    return room;
  }

  /** @throws ConflictError if the slug is taken or empty. */
  static create(input: { name: string; topic?: string; context?: string }): Room {
    const id = slugify(input.name);
    if (!id) throw new ConflictError("Room name must contain letters or digits");
    if (this.find(id)) throw new ConflictError(`Room #${id} already exists`);
    return db
      .insert(rooms)
      .values({ id, topic: input.topic ?? "", context: input.context ?? "" })
      .returning()
      .get();
  }

  static update(id: string, patch: Partial<Pick<Room, "topic" | "context" | "paused">>): Room {
    this.get(id);
    return db.update(rooms).set(patch).where(eq(rooms.id, id)).returning().get();
  }

  static remove(id: string): void {
    db.delete(rooms).where(eq(rooms.id, id)).run();
  }

  static members(roomId: string): RoomMember[] {
    return db.select().from(roomMembers).where(eq(roomMembers.roomId, roomId)).orderBy(asc(roomMembers.joinedAt)).all();
  }

  /** Rooms a session belongs to. */
  static roomsOf(sessionId: string): RoomMember[] {
    return db.select().from(roomMembers).where(eq(roomMembers.sessionId, sessionId)).all();
  }

  static member(roomId: string, sessionId: string): RoomMember | undefined {
    return db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.sessionId, sessionId)))
      .get();
  }

  /**
   * Add a session to a room. A taken alias gets a numeric suffix.
   *
   * @throws ConflictError if the session is already a member.
   */
  static addMember(input: { roomId: string; sessionId: string; alias: string; name: string; cwd: string }): RoomMember {
    this.get(input.roomId);
    if (this.member(input.roomId, input.sessionId)) throw new ConflictError("Session is already in this room");
    const base = slugify(input.alias) || "agent";
    const taken = new Set(this.members(input.roomId).map((m) => m.alias));
    let alias = base;
    for (let i = 2; taken.has(alias) || alias === "operator"; i++) alias = `${base}-${i}`;
    return db.insert(roomMembers).values({ ...input, alias }).returning().get();
  }

  /** Keep the display snapshot of a member fresh while it is online. */
  static touchMember(roomId: string, sessionId: string, snapshot: { name: string; cwd: string }): void {
    db.update(roomMembers)
      .set(snapshot)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.sessionId, sessionId)))
      .run();
  }

  static removeMember(roomId: string, sessionId: string): void {
    db.delete(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.sessionId, sessionId))).run();
  }
}
