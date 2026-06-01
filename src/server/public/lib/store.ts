import { create } from "zustand";
import { api } from "./api";
import type { Channel, AgentChannel, Message, ContextInjection } from "../../../db/schema";

/** A project group, as returned by GET /api/groups. */
export interface Group {
  id: string;
  display_name: string;
}

/** A channel member enriched with live presence (GET /api/channels/:id/members). */
export interface MemberPresence extends AgentChannel {
  status: string;
  status_note: string | null;
  last_heartbeat: number;
}

/** Stable empty references so selectors never return a fresh array. */
const EMPTY_MEMBERS: MemberPresence[] = [];
const EMPTY_MESSAGES: Message[] = [];

interface HubState {
  channels: Channel[];
  groups: Group[];
  contexts: ContextInjection[];
  membersByChannel: Record<string, MemberPresence[]>;
  messagesByChannel: Record<string, Message[]>;
  loaded: boolean;

  /** Refresh every slice from the API (the global poller calls this). */
  poll: () => Promise<void>;

  // ── Mutations (all via Eden Treaty; each refreshes afterwards) ──
  createChannel: (id: string, topic: string, context?: string) => Promise<void>;
  archiveChannel: (channelId: string) => Promise<void>;
  invite: (
    channelId: string,
    opts: { alias: string; role?: string; group?: string; workingDir?: string; extraContext?: string },
  ) => Promise<void>;
  removeMember: (channelId: string, agentId: string) => Promise<void>;
  /** Reconstruct a member's ready-to-paste join prompt from persisted state. */
  getAgentPrompt: (channelId: string, agentId: string) => Promise<string>;
  sendMessage: (channelId: string, body: string) => Promise<void>;
  addContext: (
    channelId: string,
    opts: { content: string; priority: "normal" | "urgent"; target: string },
  ) => Promise<void>;
}

/**
 * Global dashboard store. Holds every slice of hub data and the actions that
 * mutate it. Backed by Eden Treaty; a single module-level poller keeps it fresh,
 * so components never fetch in effects — they just select from here.
 */
export const useHub = create<HubState>((set, get) => ({
  channels: [],
  groups: [],
  contexts: [],
  membersByChannel: {},
  messagesByChannel: {},
  loaded: false,

  poll: async () => {
    const [chRes, grRes, ctxRes] = await Promise.all([
      api.api.channels.get(),
      api.api.groups.get(),
      api.api.context.get(),
    ]);

    const channels = (chRes.data?.channels ?? []) as Channel[];
    const groups = (grRes.data?.groups ?? []) as Group[];
    const contexts = (ctxRes.data?.context ?? []) as ContextInjection[];

    const membersByChannel: Record<string, MemberPresence[]> = {};
    const messagesByChannel: Record<string, Message[]> = {};
    await Promise.all(
      channels.map(async (ch) => {
        const [mRes, msgRes] = await Promise.all([
          api.api.channels({ id: ch.id }).members.get(),
          api.api.channels({ id: ch.id }).messages.get(),
        ]);
        membersByChannel[ch.id] = (mRes.data?.members ?? []) as MemberPresence[];
        messagesByChannel[ch.id] = (msgRes.data?.messages ?? []) as Message[];
      }),
    );

    set({ channels, groups, contexts, membersByChannel, messagesByChannel, loaded: true });
  },

  createChannel: async (id, topic, context) => {
    await api.api.channels.post({ id, topic, created_by: "moderator" });
    if (context?.trim()) {
      await api.api.context.post({
        channel_id: id,
        target_agent: "all",
        content: context.trim(),
        priority: "normal",
      });
    }
    await get().poll();
  },

  archiveChannel: async (channelId) => {
    await api.api.channels({ id: channelId }).archive.patch({});
    await get().poll();
  },

  invite: async (channelId, { alias, role, group, workingDir, extraContext }) => {
    await api.api.channels({ id: channelId }).members.post({
      alias,
      role_description: role?.trim() || undefined,
      group_id: group?.trim() || undefined,
      working_dir: workingDir?.trim() || undefined,
    });
    if (extraContext?.trim()) {
      await api.api.context.post({
        channel_id: channelId,
        target_agent: alias,
        content: extraContext.trim(),
        priority: "normal",
      });
    }
    await get().poll();
  },

  removeMember: async (channelId, agentId) => {
    await api.api.channels({ id: channelId }).members({ agentId }).delete();
    await get().poll();
  },

  getAgentPrompt: async (channelId, agentId) => {
    const res = await api.api.channels({ id: channelId }).members({ agentId }).prompt.get();
    const data = res.data as { ok?: boolean; prompt?: string; error?: string } | string | null;
    if (data && typeof data === "object" && data.ok && typeof data.prompt === "string") {
      return data.prompt;
    }
    const error =
      data && typeof data === "object" && typeof data.error === "string"
        ? data.error
        : "Failed to load prompt — is the server up to date?";
    throw new Error(error);
  },

  sendMessage: async (channelId, body) => {
    await api.api.messages.post({ channel_id: channelId, body });
    await get().poll();
  },

  addContext: async (channelId, { content, priority, target }) => {
    await api.api.context.post({
      channel_id: channelId,
      content,
      priority,
      target_agent: target.trim() || "all",
    });
    await get().poll();
  },
}));

// ── Selector helpers (return stable refs; derive in components) ──

export const selectMembers = (channelId: string) => (s: HubState): MemberPresence[] =>
  s.membersByChannel[channelId] ?? EMPTY_MEMBERS;

export const selectMessages = (channelId: string) => (s: HubState): Message[] =>
  s.messagesByChannel[channelId] ?? EMPTY_MESSAGES;

// ── Global poller: starts once when this module is first imported ──

const POLL_INTERVAL_MS = 2000;
function tick(): void {
  void useHub.getState().poll().catch(() => {/* transient network errors are ignored */});
}
tick();
setInterval(tick, POLL_INTERVAL_MS);
