import { Elysia, t } from "elysia";
import { NAME, VERSION } from "../../version";
import { envConfig } from "../../env-config";
import { RouteNotFoundError, ValidationError } from "../../errors/custom-errors";
import { PERMISSION_MODES } from "../../core/permission-modes";
import { stopBackgroundSession } from "../../core/spawner";
import { chatKey, type Hub, type HubEvent } from "../../core/hub";
import { guardHook } from "./guard";

const before = t.Object({ before: t.Optional(t.Numeric()) });
const AGENT_ID = "^[A-Za-z0-9_-]{1,64}$";

/** Catch-all for `/api/*` paths no route matched. */
function unknownRoute({ request }: { request: Request }): never {
  throw new RouteNotFoundError(request.method, new URL(request.url).pathname);
}
const body = t.Object({ body: t.String({ minLength: 1, maxLength: 100_000 }) });

/**
 * All REST endpoints plus the `/api/ws` push channel.
 *
 * @param hub the running hub instance
 */
export function apiPlugin(hub: Hub) {
  /** Live chats each WebSocket connection is watching, by chat key (for cleanup on close). */
  const watching = new Map<string, Map<string, { sessionId: string; agentId?: string }>>();
  return new Elysia({ prefix: "/api" })
    .onBeforeHandle(guardHook)
    .get("/health", () => ({
      ok: true as const,
      name: NAME,
      version: VERSION,
      pid: process.pid,
      address: hub.address,
      socketPath: hub.socketPath,
      sessionsDir: envConfig.SESSIONS_DIR,
      permissionModes: PERMISSION_MODES,
    }))

    // ─── Sessions ─────────────────────────────────────────────────────────────
    .get("/sessions", () => hub.sessions())
    // `:id` is a session id for reads (works offline); pid, name or session id for actions.
    .get("/sessions/:id/messages", ({ params, query }) => hub.directMessages(params.id, query.before), { query: before })
    .post("/sessions/:id/messages", ({ params, body }) => hub.sendDirect(params.id, body.body), { body })
    .get("/sessions/:id/transcript", ({ params, query }) => hub.transcriptHistory(params.id, query.agentId, query.limit), {
      query: t.Object({
        agentId: t.Optional(t.String({ pattern: AGENT_ID })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 2000 })),
      }),
    })
    .get("/sessions/:id/subagents", ({ params }) => hub.subagents(params.id))
    .post(
      "/sessions/:id/subagents/:agentId/messages",
      ({ params, body }) => hub.relayToSubagent(params.id, params.agentId, "message", body.body),
      { body, params: t.Object({ id: t.String(), agentId: t.String({ pattern: AGENT_ID }) }) },
    )
    .post("/sessions/:id/subagents/:agentId/stop", ({ params }) => hub.relayToSubagent(params.id, params.agentId, "stop"), {
      params: t.Object({ id: t.String(), agentId: t.String({ pattern: AGENT_ID }) }),
    })
    .post("/sessions/:id/stop", async ({ params }) => {
      const session = hub.registry.resolve(params.id);
      if (!session.jobId) throw new ValidationError("Only background (claude --bg) sessions can be stopped from AgentHub");
      await stopBackgroundSession(session.jobId);
      return { ok: true as const };
    })

    // ─── Rooms ────────────────────────────────────────────────────────────────
    .get("/rooms", () => hub.rooms())
    .post("/rooms", ({ body }) => hub.createRoom(body), {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60 }),
        topic: t.Optional(t.String({ maxLength: 500 })),
        context: t.Optional(t.String({ maxLength: 20_000 })),
      }),
    })
    .get("/rooms/:id", ({ params }) => hub.room(params.id))
    .patch("/rooms/:id", ({ params, body }) => hub.updateRoom(params.id, body), {
      body: t.Object({
        topic: t.Optional(t.String({ maxLength: 500 })),
        context: t.Optional(t.String({ maxLength: 20_000 })),
        paused: t.Optional(t.Boolean()),
      }),
    })
    .delete("/rooms/:id", ({ params }) => {
      hub.deleteRoom(params.id);
      return { ok: true as const };
    })
    .get("/rooms/:id/messages", ({ params, query }) => hub.roomMessages(params.id, query.before), { query: before })
    .post("/rooms/:id/messages", ({ params, body }) => hub.postToRoom(params.id, body.body), { body })
    .post("/rooms/:id/members", ({ params, body }) => hub.addMember(params.id, body.sessionId, body.alias), {
      body: t.Object({ sessionId: t.String({ minLength: 1 }), alias: t.Optional(t.String({ maxLength: 40 })) }),
    })
    .delete("/rooms/:id/members/:sessionId", ({ params }) => hub.removeMember(params.id, params.sessionId))

    // ─── Spawn ────────────────────────────────────────────────────────────────
    .post("/spawn", ({ body }) => hub.spawn(body), {
      body: t.Object({
        cwd: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1, maxLength: 80 }),
        prompt: t.Optional(t.String({ maxLength: 100_000 })),
        permissionMode: t.Optional(t.UnionEnum(PERMISSION_MODES)),
        model: t.Optional(t.String({ maxLength: 80 })),
        roomId: t.Optional(t.String()),
        alias: t.Optional(t.String({ maxLength: 40 })),
      }),
    })

    // Unknown /api paths must not fall through to the SPA's `/*` and come back as HTML.
    // Per-method routes, not `.all()`: only these reach Bun's native router,
    // which is what ranks `/api/*` above the SPA wildcard.
    .get("/*", unknownRoute)
    .post("/*", unknownRoute)
    .patch("/*", unknownRoute)
    .delete("/*", unknownRoute)

    // ─── Live push ────────────────────────────────────────────────────────────
    .ws("/ws", {
      // Clients opt into a session's live chat; everything else is pushed to all.
      body: t.Object({
        type: t.UnionEnum(["watch", "unwatch"]),
        sessionId: t.String({ pattern: "^[A-Za-z0-9-]+$" }),
        agentId: t.Optional(t.String({ pattern: AGENT_ID })),
      }),
      open(ws) {
        ws.subscribe("hub");
        const snapshot: HubEvent[] = [
          { type: "sessions", sessions: hub.sessions() },
          { type: "rooms", rooms: hub.rooms() },
        ];
        for (const event of snapshot) ws.send(JSON.stringify(event));
      },
      async message(ws, msg) {
        const watched = watching.get(ws.id) ?? new Map<string, { sessionId: string; agentId?: string }>();
        watching.set(ws.id, watched);
        const key = chatKey(msg.sessionId, msg.agentId);
        const topic = `transcript:${key}`;
        if (msg.type === "watch" && !watched.has(key)) {
          watched.set(key, { sessionId: msg.sessionId, agentId: msg.agentId });
          ws.subscribe(topic);
          await hub.watchTranscript(msg.sessionId, msg.agentId);
        } else if (msg.type === "unwatch" && watched.delete(key)) {
          ws.unsubscribe(topic);
          hub.unwatchTranscript(msg.sessionId, msg.agentId);
        }
      },
      close(ws) {
        for (const { sessionId, agentId } of watching.get(ws.id)?.values() ?? []) hub.unwatchTranscript(sessionId, agentId);
        watching.delete(ws.id);
      },
    });
}
