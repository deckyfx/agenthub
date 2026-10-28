import { TypedEmitter } from "../lib/emitter";
import { catchError, catchErrorTyped } from "../lib/error-handler";
import { ConflictError, SessionNotFoundError, ValidationError } from "../errors/custom-errors";
import { envConfig } from "../env-config";
import { RoomStore } from "../stores/room-store";
import { MessageStore, type MessageWithDeliveries } from "../stores/message-store";
import type { DeliveryStatus, Message, Room, RoomMember } from "../db/schema";
import { SessionRegistry, type Session } from "./sessions";
import { HubInbox } from "./hub-inbox";
import { sendToSession } from "./peer-client";
import { socketPathFromAddress, SUPPORTED_PEER_PROTOCOL, type PeerPriority, type PeerUserFrame } from "./peer-protocol";
import { answersProblem, formatAnswerMessage, type Answers } from "./questions";
import { spawnSession, type SpawnRequest, type SpawnResult } from "./spawner";
import { chatKey } from "./chat-key";
import {
  findTranscript,
  listSubagents,
  readHistory,
  subagentTranscript,
  TranscriptTail,
  type ChatEntry,
  type SubagentInfo,
} from "./transcript";

/** Label for messages typed by the human at the dashboard / TUI. */
export const OPERATOR = "operator";
/** Label the hub uses for its own notices. */
const HUB_LABEL = "hub";
/** Fallback when no live session hints at the socket dir. */
const DEFAULT_SOCKET_DIR = "/tmp/cc-socks";

/** Auto-pause a room that relays more than this many messages per window (runaway agent loops). */
const RELAY_BURST_LIMIT = 30;
const RELAY_WINDOW_MS = 60_000;

/** A room member enriched with live presence. */
export interface MemberView extends RoomMember {
  online: boolean;
  pid?: number;
  status?: Session["status"];
}

/** A room plus its members. */
export interface RoomView extends Room {
  members: MemberView[];
}

/** Everything the hub pushes to connected clients. */
export type HubEvent =
  | { type: "sessions"; sessions: Session[] }
  | { type: "rooms"; rooms: RoomView[] }
  | { type: "message"; message: MessageWithDeliveries }
  | { type: "delivery"; messageId: number; sessionId: string; status: DeliveryStatus; error?: string }
  | { type: "notice"; level: "info" | "warn"; text: string }
  /** New entries in a watched live chat — a session's, or one of its subagents' (published per chat, not globally). */
  | { type: "transcript"; sessionId: string; agentId?: string; entries: ChatEntry[] }
  /** A watched session's subagents changed (launched / went quiet). */
  | { type: "subagents"; sessionId: string; subagents: SubagentInfo[] };

export { chatKey };

/** How often watched sessions are checked for new / finished subagents. */
const SUBAGENT_POLL_MS = 3000;

interface HubEvents extends Record<string, unknown> {
  event: HubEvent;
}

/** `@alias` mentions in a body. */
function mentions(body: string): Set<string> {
  return new Set([...body.matchAll(/(?:^|[\s(])@([a-z0-9][a-z0-9-]*)/gi)].map((m) => (m[1] ?? "").toLowerCase()));
}

/** Split a leading `#room` tag off an inbound body. */
function splitRoomTag(body: string): { tag?: string; rest: string } {
  const m = /^\s*#([a-z0-9][a-z0-9-]*)\b[:\s-]*/i.exec(body);
  return m ? { tag: m[1]?.toLowerCase(), rest: body.slice(m[0].length) } : { rest: body };
}

/**
 * The relay hub: discovers sessions, owns the hub socket, routes messages
 * between the operator, rooms and sessions, and persists history.
 */
export class Hub extends TypedEmitter<HubEvents> {
  readonly registry = new SessionRegistry();
  private inbox: HubInbox | undefined;
  private relayLog = new Map<string, number[]>();
  /** Live-chat tails keyed by {@link chatKey}, reference-counted by watching clients. */
  private tails = new Map<string, { tail: TranscriptTail; watchers: number; subagentPoll?: ReturnType<typeof setInterval> }>();

  /** Address sessions reply to (valid after {@link start}). */
  get address(): string {
    return this.inbox?.address ?? "";
  }

  get socketPath(): string {
    return this.inbox?.socketPath ?? "";
  }

  /**
   * Scan sessions, bind the hub socket next to theirs, and start routing.
   *
   * @throws HubAlreadyRunningError
   */
  async start(): Promise<void> {
    await this.registry.start();
    const dir = envConfig.HUB_SOCKET_DIR ?? this.registry.dominantSocketDir() ?? DEFAULT_SOCKET_DIR;
    this.inbox = new HubInbox(dir);
    await this.inbox.start();

    this.inbox.on("message", (frame) => void this.handleInbound(frame));
    this.inbox.on("control", (frame) => {
      if (envConfig.isDevelopment) console.log(`[hub] control frame: ${frame.action}`);
    });
    this.registry.on("change", (sessions) => {
      this.push({ type: "sessions", sessions });
      this.pushRooms();
    });
    this.registry.on("online", (session) => void this.flushPending(session));

    for (const s of this.registry.list()) {
      if (s.peerProtocol !== undefined && s.peerProtocol !== SUPPORTED_PEER_PROTOCOL) {
        console.warn(`[hub] ${s.name} (pid ${s.pid}) speaks peerProtocol ${s.peerProtocol}; this hub speaks ${SUPPORTED_PEER_PROTOCOL}`);
      }
    }
  }

  async stop(): Promise<void> {
    this.registry.stop();
    for (const { tail, subagentPoll } of this.tails.values()) {
      tail.stop();
      if (subagentPoll) clearInterval(subagentPoll);
    }
    this.tails.clear();
    await this.inbox?.stop();
  }

  private push(event: HubEvent): void {
    this.emit("event", event);
  }

  private pushRooms(): void {
    this.push({ type: "rooms", rooms: this.rooms() });
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  sessions(): Session[] {
    return this.registry.list();
  }

  private memberView(m: RoomMember): MemberView {
    const live = this.registry.get(m.sessionId);
    return { ...m, online: !!live, pid: live?.pid, status: live?.status };
  }

  rooms(): RoomView[] {
    return RoomStore.list().map((r) => ({ ...r, members: RoomStore.members(r.id).map((m) => this.memberView(m)) }));
  }

  room(id: string): RoomView {
    const room = RoomStore.get(id);
    return { ...room, members: RoomStore.members(id).map((m) => this.memberView(m)) };
  }

  roomMessages(id: string, before?: number): MessageWithDeliveries[] {
    RoomStore.get(id);
    return MessageStore.forRoom(id, 200, before);
  }

  directMessages(sessionId: string, before?: number): MessageWithDeliveries[] {
    return MessageStore.forDirect(sessionId, 200, before);
  }

  // ─── Rooms ──────────────────────────────────────────────────────────────────

  createRoom(input: { name: string; topic?: string; context?: string }): RoomView {
    const room = RoomStore.create(input);
    this.pushRooms();
    return this.room(room.id);
  }

  updateRoom(id: string, patch: { topic?: string; context?: string; paused?: boolean }): RoomView {
    RoomStore.update(id, patch);
    if (patch.paused === false) {
      this.relayLog.delete(id);
      // Deliver whatever tripped the burst guard.
      for (const m of RoomStore.members(id)) {
        const live = this.registry.get(m.sessionId);
        if (live) void this.flushPending(live);
      }
    }
    this.pushRooms();
    return this.room(id);
  }

  deleteRoom(id: string): void {
    const members = RoomStore.members(id);
    for (const m of members) {
      const live = this.registry.get(m.sessionId);
      if (live) void this.notify(live, `Room #${id} was closed by the operator. Stop sending messages for #${id}.`);
    }
    RoomStore.remove(id);
    this.pushRooms();
  }

  /**
   * Add a live session to a room and brief it; tell existing members.
   *
   * @throws SessionNotFoundError | RoomNotFoundError | ConflictError
   */
  async addMember(roomId: string, sessionId: string, alias?: string): Promise<RoomView> {
    const session = this.registry.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const existing = RoomStore.members(roomId);
    const member = RoomStore.addMember({
      roomId,
      sessionId,
      alias: alias?.trim() || session.project || session.name,
      name: session.name,
      cwd: session.cwd,
    });
    this.pushRooms();

    const room = RoomStore.get(roomId);
    await this.notify(session, this.briefing(room, member));
    const joined = MessageStore.create({
      roomId,
      sessionId: null,
      senderKind: "hub",
      senderLabel: HUB_LABEL,
      body: `@${member.alias} (${session.name} · ${session.cwd}) joined the room.`,
      recipients: existing.map((m) => m.sessionId),
    });
    this.push({ type: "message", message: joined });
    await this.deliver(joined);
    return this.room(roomId);
  }

  async removeMember(roomId: string, sessionId: string): Promise<RoomView> {
    const member = RoomStore.member(roomId, sessionId);
    RoomStore.removeMember(roomId, sessionId);
    this.pushRooms();
    const live = this.registry.get(sessionId);
    if (member && live) await this.notify(live, `You were removed from room #${roomId}. Stop sending messages for #${roomId}.`);
    return this.room(roomId);
  }

  /** The join briefing: who's here and how to talk through the hub. */
  private briefing(room: Room, member: RoomMember): string {
    const others = RoomStore.members(room.id).filter((m) => m.sessionId !== member.sessionId);
    const roster = [
      `- @${OPERATOR} — the human running AgentHub`,
      ...others.map((m) => `- @${m.alias} — ${m.name} in ${m.cwd}`),
    ].join("\n");
    return [
      `You joined AgentHub room #${room.id} as @${member.alias}.${room.topic ? ` Topic: ${room.topic}` : ""}`,
      "",
      "AgentHub relays between Claude Code sessions working in different repos. Talk to the room by",
      `SendMessage to "${this.address}" (this message's from address). Start the message with #${room.id}.`,
      "Everyone in the room receives it unless you @mention specific members; @operator reaches only the human.",
      "Send results, questions, decisions and blockers — skip acknowledgements and pleasantries.",
      "",
      "Members:",
      roster,
      ...(room.context.trim() ? ["", "Context:", room.context.trim()] : []),
    ].join("\n");
  }

  /** One-off hub notice to a session (not logged). */
  private async notify(session: Session, body: string): Promise<void> {
    const [err] = await catchError(sendToSession(session, { from: this.address, fromName: "AgentHub", body }));
    if (err) this.push({ type: "notice", level: "warn", text: err.message });
  }

  // ─── Sending ────────────────────────────────────────────────────────────────

  /** Post as the operator to a room. `@alias` mentions narrow the recipients. */
  async postToRoom(roomId: string, body: string): Promise<MessageWithDeliveries> {
    RoomStore.get(roomId);
    const message = MessageStore.create({
      roomId,
      sessionId: null,
      senderKind: "operator",
      senderLabel: OPERATOR,
      body,
      recipients: this.roomRecipients(roomId, body, undefined),
    });
    this.push({ type: "message", message });
    await this.deliver(message);
    return MessageStore.get(message.id) ?? message;
  }

  /**
   * Message one session directly as the operator.
   *
   * @param ref pid, session id, or unique name
   * @param priority `now` interrupts the session's current turn; default `next`
   */
  async sendDirect(ref: string, body: string, priority?: PeerPriority): Promise<MessageWithDeliveries> {
    const session = this.registry.resolve(ref);
    const message = MessageStore.create({
      roomId: null,
      sessionId: session.sessionId,
      senderKind: "operator",
      senderLabel: OPERATOR,
      body,
      recipients: [session.sessionId],
    });
    this.push({ type: "message", message });
    await this.deliver(message, priority);
    return MessageStore.get(message.id) ?? message;
  }

  /**
   * Answer an AskUserQuestion that is still open in a session's dialog. Claude
   * Code has no way for a peer to fill in the dialog, so this sends the
   * answers at priority `now`: the session's turn is interrupted (closing the
   * dialog) and the answers arrive as its next prompt.
   *
   * Checked against the transcript first so a question answered at the
   * terminal (or a turn that moved on) is never interrupted.
   *
   * @throws SessionNotFoundError if the session isn't running
   * @throws ConflictError if the question is unknown or no longer open
   * @throws ValidationError if a question is unanswered or the answers name another question
   */
  async answerQuestion(ref: string, toolUseId: string, answers: Answers): Promise<MessageWithDeliveries> {
    const session = this.registry.resolve(ref);
    const chat = await this.transcriptHistory(session.sessionId);
    const asked = chat.find((e) => e.kind === "question" && e.id === toolUseId);
    if (asked?.kind !== "question") throw new ConflictError("That question isn't in the session's recent conversation");
    const settled = chat.some(
      (e) => (e.kind === "result" && e.toolUseId === toolUseId) || (e.kind === "prompt" && e.answersFor?.toolUseId === toolUseId),
    );
    if (settled) throw new ConflictError("That question was already answered");
    const problem = answersProblem(asked.questions, answers);
    if (problem) throw new ValidationError(problem, "answers");
    return this.sendDirect(session.sessionId, formatAnswerMessage(toolUseId, asked.questions, answers), "now");
  }

  /** Room members a message goes to: mentioned aliases, else everyone but the sender. */
  private roomRecipients(roomId: string, body: string, senderSessionId: string | undefined): string[] {
    const members = RoomStore.members(roomId).filter((m) => m.sessionId !== senderSessionId);
    const tagged = mentions(body);
    const targeted = members.filter((m) => tagged.has(m.alias));
    // Narrow only on handles that exist here, so stray text like `@types/react` still broadcasts.
    // Only @operator mentioned → nobody else; the operator always sees the feed.
    if (tagged.has("all") || (targeted.length === 0 && !tagged.has(OPERATOR))) return members.map((m) => m.sessionId);
    return targeted.map((m) => m.sessionId);
  }

  /** Render a stored message for a recipient session. */
  private outbound(message: Message): { fromName: string; body: string } {
    if (!message.roomId) return { fromName: "AgentHub (operator)", body: message.body };
    const sender = message.senderLabel === OPERATOR || message.senderKind === "hub" ? message.senderLabel : `@${message.senderLabel}`;
    return { fromName: `AgentHub #${message.roomId}`, body: `#${message.roomId} — ${sender}:\n${message.body}` };
  }

  /** Attempt every pending delivery of a message to recipients that are online now. */
  private async deliver(message: MessageWithDeliveries, priority?: PeerPriority): Promise<void> {
    const rendered = { ...this.outbound(message), priority };
    await Promise.all(
      message.deliveries
        .filter((d) => d.status === "pending")
        .map(async (d) => {
          const session = this.registry.get(d.sessionId);
          if (!session) return; // stays pending until it comes back online
          await this.deliverOne(message.id, session, rendered);
        }),
    );
  }

  private async deliverOne(messageId: number, session: Session, rendered: { fromName: string; body: string; priority?: PeerPriority }): Promise<void> {
    const [err] = await catchError(sendToSession(session, { from: this.address, ...rendered }));
    const status: DeliveryStatus = err ? "failed" : "sent";
    MessageStore.setDelivery(messageId, session.sessionId, status, err?.message);
    this.push({ type: "delivery", messageId, sessionId: session.sessionId, status, error: err?.message });
  }

  /** A session came (back) online: deliver what queued up while it was away. */
  private async flushPending(session: Session): Promise<void> {
    for (const message of MessageStore.pendingFor(session.sessionId)) {
      await this.deliverOne(message.id, session, this.outbound(message));
    }
    for (const m of RoomStore.roomsOf(session.sessionId)) {
      RoomStore.touchMember(m.roomId, session.sessionId, { name: session.name, cwd: session.cwd });
    }
  }

  // ─── Inbound ────────────────────────────────────────────────────────────────

  /** Route a message a session sent to the hub socket. */
  private async handleInbound(frame: PeerUserFrame): Promise<void> {
    const address = frame.from ?? frame.envelope.from ?? "";
    const socketPath = socketPathFromAddress(address);
    let sender = socketPath ? this.registry.bySocket(socketPath) : undefined;
    if (!sender && socketPath) {
      await this.registry.refresh(); // brand-new session not scanned yet
      sender = this.registry.bySocket(socketPath);
    }
    const label = sender?.name ?? frame.envelope.fromName ?? (address || "unknown");
    const { tag, rest } = splitRoomTag(frame.envelope.body);
    const memberships = sender ? RoomStore.roomsOf(sender.sessionId) : [];

    const membership = tag
      ? memberships.find((m) => m.roomId === tag)
      : memberships.length === 1
        ? memberships[0]
        : undefined;

    if (!membership || !sender) {
      if (tag && RoomStore.find(tag) && sender) {
        this.push({ type: "notice", level: "warn", text: `${label} wrote to #${tag} but is not a member — kept as a direct message` });
      }
      const message = MessageStore.create({
        roomId: null,
        sessionId: sender?.sessionId ?? null,
        senderKind: "session",
        senderLabel: label,
        body: frame.envelope.body,
        recipients: [],
      });
      this.push({ type: "message", message });
      return;
    }

    const room = RoomStore.get(membership.roomId);
    const body = tag ? rest : frame.envelope.body;
    const recipients = room.paused ? [] : this.roomRecipients(room.id, body, sender.sessionId);
    const message = MessageStore.create({
      roomId: room.id,
      sessionId: sender.sessionId,
      senderKind: "session",
      senderLabel: membership.alias,
      body,
      recipients,
    });
    this.push({ type: "message", message });
    if (recipients.length > 0 && this.tripsBurstLimit(room.id)) return;
    await this.deliver(message);
  }

  /**
   * Sliding-window guard against agents ping-ponging forever. Trips → pause
   * the room and tell the operator; the triggering message stays pending.
   */
  private tripsBurstLimit(roomId: string): boolean {
    const now = Date.now();
    const log = (this.relayLog.get(roomId) ?? []).filter((t) => now - t < RELAY_WINDOW_MS);
    log.push(now);
    this.relayLog.set(roomId, log);
    if (log.length <= RELAY_BURST_LIMIT) return false;
    RoomStore.update(roomId, { paused: true });
    this.pushRooms();
    this.push({
      type: "notice",
      level: "warn",
      text: `#${roomId} relayed ${log.length} messages in a minute — paused to stop a possible agent loop. Resume it when ready.`,
    });
    return true;
  }

  // ─── Live chat (transcripts) ────────────────────────────────────────────────

  /** Best known cwd for a session — live record, else a room membership snapshot. */
  private cwdOf(sessionId: string): string | undefined {
    return this.registry.get(sessionId)?.cwd ?? RoomStore.roomsOf(sessionId)[0]?.cwd;
  }

  /** Transcript file of a session, or of one of its subagents. */
  private async chatPath(sessionId: string, agentId?: string): Promise<string | undefined> {
    const main = await findTranscript(sessionId, this.cwdOf(sessionId));
    if (!main || !agentId) return main;
    return subagentTranscript(main, agentId);
  }

  /** The last `limit` entries of a live chat (empty if nothing was written yet). */
  async transcriptHistory(sessionId: string, agentId?: string, limit = 400): Promise<ChatEntry[]> {
    const path = await this.chatPath(sessionId, agentId);
    return path && (await Bun.file(path).exists()) ? readHistory(path, limit) : [];
  }

  /** Subagents a session has launched, most recently active first. */
  async subagents(sessionId: string): Promise<SubagentInfo[]> {
    const main = await this.chatPath(sessionId);
    return main ? listSubagents(main) : [];
  }

  /**
   * Start (or share) a tail of a live chat; entries arrive as `transcript`
   * events. Watching a session also reports its subagents as they change.
   */
  async watchTranscript(sessionId: string, agentId?: string): Promise<void> {
    const key = chatKey(sessionId, agentId);
    const current = this.tails.get(key);
    if (current) {
      current.watchers++;
      return;
    }
    const tail = new TranscriptTail(key, () => this.chatPath(sessionId, agentId));
    const entry: { tail: TranscriptTail; watchers: number; subagentPoll?: ReturnType<typeof setInterval> } = { tail, watchers: 1 };
    this.tails.set(key, entry);
    tail.on("entries", (entries) => this.push({ type: "transcript", sessionId, agentId, entries }));
    await tail.start();

    if (!agentId) {
      let last = "";
      const check = async () => {
        const subagents = await this.subagents(sessionId);
        const fingerprint = subagents.map((a) => `${a.agentId}:${a.active}`).join(",");
        if (fingerprint === last) return;
        last = fingerprint;
        this.push({ type: "subagents", sessionId, subagents });
      };
      await check();
      entry.subagentPoll = setInterval(() => void check(), SUBAGENT_POLL_MS);
    }
  }

  /** Drop one watcher; the tail stops when nobody is watching. */
  unwatchTranscript(sessionId: string, agentId?: string): void {
    const key = chatKey(sessionId, agentId);
    const current = this.tails.get(key);
    if (!current) return;
    if (--current.watchers > 0) return;
    current.tail.stop();
    if (current.subagentPoll) clearInterval(current.subagentPoll);
    this.tails.delete(key);
  }

  /**
   * Message or stop a subagent. Subagents live inside their parent's process
   * and have no socket, so this asks the parent (whose SendMessage / TaskStop
   * reach them) to do it. It's a request to the parent's model, not a direct
   * delivery; the request is logged in the parent's direct thread.
   *
   * @throws SessionNotFoundError if the parent isn't running
   */
  async relayToSubagent(sessionId: string, agentId: string, action: "message" | "stop", body = ""): Promise<MessageWithDeliveries> {
    const info = (await this.subagents(sessionId)).find((a) => a.agentId === agentId);
    const label = `subagent ${agentId}${info?.description ? ` ("${info.description}")` : ""}`;
    const text =
      action === "stop"
        ? `The AgentHub operator asks you to stop your ${label} with TaskStop. Reply to this address only if you can't.`
        : `The AgentHub operator asks you to relay this to your ${label} with SendMessage (to: "${agentId}"), then carry on with what you were doing:\n\n${body}`;
    return this.sendDirect(sessionId, text);
  }

  // ─── Spawning ───────────────────────────────────────────────────────────────

  /**
   * Start a background Claude session; optionally wait for it to register and
   * add it to a room.
   */
  async spawn(req: SpawnRequest & { roomId?: string; alias?: string }): Promise<SpawnResult & { session?: Session }> {
    if (req.roomId) RoomStore.get(req.roomId);
    const since = Date.now();
    const result = await spawnSession(req);
    const session = await this.waitForSession((s) => s.cwd === req.cwd && s.name === req.name.trim() && s.startedAt >= since - 2000);
    if (session && req.roomId) {
      const [err] = await catchErrorTyped(this.addMember(req.roomId, session.sessionId, req.alias), [ConflictError]);
      if (err) this.push({ type: "notice", level: "warn", text: err.message });
    }
    if (!session) {
      this.push({ type: "notice", level: "warn", text: `Spawned '${req.name}' but it has not registered a session yet` });
    }
    return { ...result, session };
  }

  /** Poll the registry until a session matches or the timeout passes. */
  private async waitForSession(match: (s: Session) => boolean, timeoutMs = 30_000): Promise<Session | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.registry.refresh();
      const hit = this.registry.list().find(match);
      if (hit) return hit;
      await Bun.sleep(500);
    }
    return undefined;
  }
}
