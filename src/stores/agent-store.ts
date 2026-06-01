import { eq } from "drizzle-orm";
import { db } from "../db";
import { agents } from "../db/schema";
import { AgentNotFoundError } from "../errors/custom-errors";
import type { Agent, NewAgent } from "../db/schema";

export type AgentStatus = "idle" | "working" | "waiting" | "blocked" | "done";

/** Repository for all agent database operations */
export class AgentStore {
  /** Register a new agent or update if already exists */
  static async upsert(data: NewAgent): Promise<Agent> {
    const result = await db
      .insert(agents)
      .values(data)
      .onConflictDoUpdate({
        target: agents.id,
        set: {
          display_name: data.display_name,
          working_dir: data.working_dir,
          last_heartbeat: data.last_heartbeat,
        },
      })
      .returning();

    const agent = result[0];
    if (!agent) throw new Error("Failed to upsert agent");
    return agent;
  }

  /** Find agent by ID */
  static async findById(id: string): Promise<Agent | null> {
    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /** Require agent by ID — throws AgentNotFoundError if missing */
  static async requireById(id: string): Promise<Agent> {
    const agent = await this.findById(id);
    if (!agent) throw new AgentNotFoundError(id);
    return agent;
  }

  /** Get all registered agents */
  static async findAll(): Promise<Agent[]> {
    return db.select().from(agents);
  }

  /**
   * Update heartbeat and optional status.
   * @throws AgentNotFoundError if agent does not exist
   */
  static async heartbeat(
    id: string,
    status: AgentStatus,
    note?: string,
  ): Promise<Agent> {
    await this.requireById(id);

    const updates: { status: AgentStatus; last_heartbeat: number; status_note?: string | null } = {
      status,
      last_heartbeat: Math.floor(Date.now() / 1000),
    };
    // Only touch the note when one was supplied; an empty string clears it.
    if (note !== undefined) updates.status_note = note.trim() || null;

    const result = await db
      .update(agents)
      .set(updates)
      .where(eq(agents.id, id))
      .returning();

    const agent = result[0];
    if (!agent) throw new Error("Failed to update heartbeat");
    return agent;
  }

  /** Override agent status (moderator action) */
  static async setStatus(id: string, status: AgentStatus): Promise<void> {
    await db.update(agents).set({ status }).where(eq(agents.id, id));
  }
}
