import { createStore, type StoreApi } from "zustand/vanilla";
import type { treaty } from "@elysiajs/eden";
import type { App } from "../server";
import type { HubEvent, RoomView } from "../core/hub";
import type { Session } from "../core/sessions";
import type { MessageWithDeliveries } from "../stores/message-store";
import type { PermissionMode } from "../core/permission-modes";
import type { ChatEntry, SubagentInfo } from "../core/transcript";
import { chatKey } from "../core/chat-key";

/** Live-chat entries kept per session in memory. */
const MAX_TRANSCRIPT = 2000;

/** The Eden client type both the browser and terminal clients share. */
export type Api = ReturnType<typeof treaty<App>>;

/** A conversation the operator can look at. */
export type Thread = { kind: "room"; id: string } | { kind: "session"; sessionId: string };

/** Stable key for a thread (`room:<id>` / `dm:<sessionId>`). */
export function threadKey(t: Thread): string {
  return t.kind === "room" ? `room:${t.id}` : `dm:${t.sessionId}`;
}

function messageKey(m: MessageWithDeliveries): string {
  return m.roomId ? `room:${m.roomId}` : `dm:${m.sessionId ?? "unknown"}`;
}

/** Outcome of a store action — `error` is ready to show to the operator. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export interface Notice {
  id: number;
  level: "info" | "warn";
  text: string;
}

export interface Health {
  version: string;
  address: string;
  socketPath: string;
  sessionsDir: string;
}

export interface SpawnInput {
  cwd: string;
  name: string;
  prompt?: string;
  permissionMode?: PermissionMode;
  model?: string;
  roomId?: string;
  alias?: string;
}

export interface HubState {
  connected: boolean;
  health: Health | null;
  sessions: Session[];
  rooms: RoomView[];
  /** Loaded threads only, keyed by {@link threadKey}. */
  threads: Record<string, MessageWithDeliveries[]>;
  unread: Record<string, number>;
  selected: Thread | null;
  notices: Notice[];
  /** Live chats being watched, keyed by `chatKey(sessionId, agentId?)`. Missing = loading. */
  transcripts: Record<string, ChatEntry[]>;
  /** Subagents of watched sessions, keyed by sessionId. */
  subagents: Record<string, SubagentInfo[]>;
  /** Subagent open inside the selected session, if any. */
  selectedAgent: string | null;

  /** Open the live event stream (auto-reconnects). Returns a disconnect fn. */
  connect(): () => void;
  /** Open a thread. Opening a session also watches its live chat (and unwatches the previous one). */
  select(thread: Thread | null): void;
  watchTranscript(sessionId: string, agentId?: string): void;
  unwatchTranscript(sessionId: string, agentId?: string): void;
  /** Open one of the selected session's subagents (null = back to the session's own chat). */
  selectAgent(agentId: string | null): void;
  /** Ask a session to message / stop one of its subagents (relayed through the parent). */
  relayToSubagent(sessionId: string, agentId: string, action: "message" | "stop", body?: string): Promise<Result>;
  loadThread(thread: Thread): Promise<void>;
  send(thread: Thread, body: string): Promise<Result>;
  createRoom(input: { name: string; topic?: string; context?: string }): Promise<Result<RoomView>>;
  updateRoom(id: string, patch: { topic?: string; context?: string; paused?: boolean }): Promise<Result>;
  deleteRoom(id: string): Promise<Result>;
  addMember(roomId: string, sessionId: string, alias?: string): Promise<Result>;
  removeMember(roomId: string, sessionId: string): Promise<Result>;
  spawn(input: SpawnInput): Promise<Result<{ jobId?: string; session?: Session }>>;
  stopSession(pid: number): Promise<Result>;
  notify(level: Notice["level"], text: string): void;
  dismiss(id: number): void;
}

/** Eden `{ error }` → readable message. */
function errorText(error: { status: unknown; value: unknown }): string {
  const v = error.value as { error?: unknown; message?: unknown } | string | undefined;
  if (typeof v === "string") return v;
  if (v && typeof v.error === "string") return v.error;
  if (v && typeof v.message === "string") return v.message;
  return `HTTP ${String(error.status)}`;
}

/** Normalise an Eden response into a {@link Result}. */
function toResult<T>(res: { data: T | null; error: { status: unknown; value: unknown } | null }): Result<T> {
  if (res.error) return { ok: false, error: errorText(res.error) };
  return { ok: true, data: res.data as T };
}

let noticeSeq = 0;

/**
 * Create the hub client store. One instance per app; the web dashboard and
 * the TUI each pass their own Eden client.
 */
export function createHubStore(api: Api): StoreApi<HubState> {
  return createStore<HubState>()((set, get) => {
    let sub: ReturnType<typeof api.api.ws.subscribe> | undefined;
    /** Live chats we want, by chat key; re-requested after every reconnect. */
    const watched = new Map<string, { sessionId: string; agentId?: string }>();

    /** Merge entries into a chat: `older` goes before what's there, else after. */
    const mergeChat = (key: string, entries: ChatEntry[], older = false) => {
      if (!watched.has(key)) return;
      const current = get().transcripts[key] ?? [];
      const seen = new Set(current.map((e) => e.id));
      const fresh = entries.filter((e) => !seen.has(e.id));
      if (fresh.length === 0 && get().transcripts[key]) return;
      const merged = older ? [...fresh, ...current] : [...current, ...fresh];
      set({ transcripts: { ...get().transcripts, [key]: merged.slice(-MAX_TRANSCRIPT) } });
    };

    const loadChat = async (sessionId: string, agentId?: string) => {
      const session = api.api.sessions({ id: sessionId });
      const { data } = await session.transcript.get({ query: agentId ? { agentId } : {} });
      if (Array.isArray(data)) mergeChat(chatKey(sessionId, agentId), data, true);
      if (!agentId) {
        const subs = await session.subagents.get();
        if (Array.isArray(subs.data) && watched.has(sessionId)) set({ subagents: { ...get().subagents, [sessionId]: subs.data } });
      }
    };

    /** Fold one pushed event into state. */
    const apply = (event: HubEvent) => {
      switch (event.type) {
        case "sessions":
          return set({ sessions: event.sessions });
        case "rooms":
          return set({ rooms: event.rooms });
        case "message": {
          const key = messageKey(event.message);
          const { threads, unread, selected } = get();
          const next: Partial<HubState> = {};
          const list = threads[key];
          if (list && !list.some((m) => m.id === event.message.id)) {
            next.threads = { ...threads, [key]: [...list, event.message] };
          }
          const isSelected = selected !== null && threadKey(selected) === key;
          if (!isSelected && event.message.senderKind !== "operator") {
            next.unread = { ...unread, [key]: (unread[key] ?? 0) + 1 };
          }
          return set(next);
        }
        case "delivery": {
          const threads = { ...get().threads };
          for (const [key, list] of Object.entries(threads)) {
            const idx = list.findIndex((m) => m.id === event.messageId);
            if (idx === -1) continue;
            const msg = list[idx];
            if (!msg) continue;
            const deliveries = msg.deliveries.map((d) =>
              d.sessionId === event.sessionId ? { ...d, status: event.status, error: event.error ?? null } : d,
            );
            threads[key] = list.with(idx, { ...msg, deliveries });
          }
          return set({ threads });
        }
        case "notice":
          return get().notify(event.level, event.text);
        case "transcript":
          return mergeChat(chatKey(event.sessionId, event.agentId), event.entries);
        case "subagents":
          return set({ subagents: { ...get().subagents, [event.sessionId]: event.subagents } });
      }
    };

    return {
      connected: false,
      health: null,
      sessions: [],
      rooms: [],
      threads: {},
      unread: {},
      selected: null,
      notices: [],
      transcripts: {},
      subagents: {},
      selectedAgent: null,

      connect() {
        let closed = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const open = () => {
          sub = api.api.ws.subscribe();
          sub.on("open", () => {
            set({ connected: true });
            void api.api.health.get().then(({ data }) => data && set({ health: data }));
            // Re-sync the open thread and live chats after a reconnect.
            const sel = get().selected;
            if (sel) void get().loadThread(sel);
            for (const { sessionId, agentId } of watched.values()) {
              sub?.send({ type: "watch", sessionId, agentId });
              void loadChat(sessionId, agentId);
            }
          });
          sub.on("message", ({ data }) => {
            const event = (typeof data === "string" ? JSON.parse(data) : data) as HubEvent;
            apply(event);
          });
          sub.on("close", () => {
            set({ connected: false });
            if (!closed) retry = setTimeout(open, 1500);
          });
        };
        open();
        return () => {
          closed = true;
          if (retry) clearTimeout(retry);
          sub?.close();
        };
      },

      select(thread) {
        const prev = get().selected;
        get().selectAgent(null);
        if (prev?.kind === "session" && (thread?.kind !== "session" || thread.sessionId !== prev.sessionId)) {
          get().unwatchTranscript(prev.sessionId);
        }
        if (thread?.kind === "session") get().watchTranscript(thread.sessionId);
        if (!thread) return set({ selected: null });
        const key = threadKey(thread);
        set({ selected: thread, unread: { ...get().unread, [key]: 0 } });
        void get().loadThread(thread);
      },

      watchTranscript(sessionId, agentId) {
        const key = chatKey(sessionId, agentId);
        if (watched.has(key)) return;
        watched.set(key, { sessionId, agentId });
        if (get().connected) sub?.send({ type: "watch", sessionId, agentId });
        void loadChat(sessionId, agentId);
      },

      unwatchTranscript(sessionId, agentId) {
        const key = chatKey(sessionId, agentId);
        if (!watched.delete(key)) return;
        if (get().connected) sub?.send({ type: "unwatch", sessionId, agentId });
        const { [key]: _, ...rest } = get().transcripts;
        set({ transcripts: rest });
      },

      selectAgent(agentId) {
        const { selected, selectedAgent } = get();
        if (selectedAgent === agentId) return;
        if (selected?.kind === "session" && selectedAgent) get().unwatchTranscript(selected.sessionId, selectedAgent);
        if (selected?.kind !== "session" || !agentId) return set({ selectedAgent: null });
        set({ selectedAgent: agentId });
        get().watchTranscript(selected.sessionId, agentId);
      },

      async relayToSubagent(sessionId, agentId, action, body) {
        const target = api.api.sessions({ id: sessionId }).subagents({ agentId });
        const r = toResult(action === "stop" ? await target.stop.post() : await target.messages.post({ body: body ?? "" }));
        return r.ok ? { ok: true, data: undefined } : r;
      },

      async loadThread(thread) {
        const res =
          thread.kind === "room"
            ? await api.api.rooms({ id: thread.id }).messages.get({ query: {} })
            : await api.api.sessions({ id: thread.sessionId }).messages.get({ query: {} });
        if (res.data && Array.isArray(res.data)) {
          set({ threads: { ...get().threads, [threadKey(thread)]: res.data } });
        }
      },

      async send(thread, body) {
        const res =
          thread.kind === "room"
            ? await api.api.rooms({ id: thread.id }).messages.post({ body })
            : await api.api.sessions({ id: thread.sessionId }).messages.post({ body });
        const r = toResult(res);
        return r.ok ? { ok: true, data: undefined } : r;
      },

      async createRoom(input) {
        return toResult(await api.api.rooms.post(input));
      },

      async updateRoom(id, patch) {
        const r = toResult(await api.api.rooms({ id }).patch(patch));
        return r.ok ? { ok: true, data: undefined } : r;
      },

      async deleteRoom(id) {
        const r = toResult(await api.api.rooms({ id }).delete());
        if (r.ok && get().selected?.kind === "room" && (get().selected as { id: string }).id === id) set({ selected: null });
        return r.ok ? { ok: true, data: undefined } : r;
      },

      async addMember(roomId, sessionId, alias) {
        const r = toResult(await api.api.rooms({ id: roomId }).members.post({ sessionId, alias }));
        return r.ok ? { ok: true, data: undefined } : r;
      },

      async removeMember(roomId, sessionId) {
        const r = toResult(await api.api.rooms({ id: roomId }).members({ sessionId }).delete());
        return r.ok ? { ok: true, data: undefined } : r;
      },

      async spawn(input) {
        const r = toResult(await api.api.spawn.post(input));
        return r.ok ? { ok: true, data: { jobId: r.data.jobId, session: r.data.session } } : r;
      },

      async stopSession(pid) {
        const r = toResult(await api.api.sessions({ id: String(pid) }).stop.post());
        return r.ok ? { ok: true, data: undefined } : r;
      },

      notify(level, text) {
        const id = ++noticeSeq;
        set({ notices: [...get().notices, { id, level, text }].slice(-5) });
        setTimeout(() => get().dismiss(id), level === "warn" ? 10_000 : 5000);
      },

      dismiss(id) {
        set({ notices: get().notices.filter((n) => n.id !== id) });
      },
    };
  });
}
