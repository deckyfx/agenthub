import type { StoreApi } from "zustand/vanilla";
import type { HubState, Result } from "../lib/hub-store";
import type { Session } from "../core/sessions";
import { chatKey } from "../core/chat-key";
import { questionStatuses, type Answers, type AskQuestion } from "../core/questions";

/** Slash commands the TUI input line understands. */
export const HELP = [
  "/room <name> [topic…]        create a room and open it",
  "/add <session> [alias]       add a session (pid, name, id prefix) to the open room",
  "/remove <alias>              remove a member from the open room",
  "/pause · /resume             stop / restart relaying in the open room",
  "/topic <text>                set the open room's topic",
  "/spawn <cwd> <name> [prompt…] start a background agent (joins the open room)",
  "/stop                        stop the open background session",
  "/close <room>                close a room (type its name to confirm)",
  "/subs                        list the open session's subagents",
  "/sub <n|id> · /main          watch a subagent's live chat · back to the session",
  "/stopsub                     ask the parent to stop the open subagent",
  '/answer <choice…>            answer the open session\'s pending question, one choice per',
  '                             question: 2 · 1,3 (multi) · "own text" — interrupts the session',
  "anything else                send to the open room / session",
].join("\n");

/** Resolve a session by pid, exact name (case-insensitive), or session-id prefix. */
function findSession(sessions: Session[], ref: string): Session | string {
  const needle = ref.toLowerCase();
  const hits = sessions.filter(
    (s) => String(s.pid) === ref || s.name.toLowerCase() === needle || (needle.length >= 6 && s.sessionId.startsWith(needle)),
  );
  if (hits.length === 1 && hits[0]) return hits[0];
  if (hits.length > 1) return `'${ref}' matches ${hits.length} sessions; use a pid`;
  return `No live session matches '${ref}'`;
}

const done = (r: Result<unknown>, ok: string): string => (r.ok ? ok : `✗ ${r.error}`);

/** Split `/answer` arguments: bare words, or "quoted text" kept whole. */
function tokens(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? "");
}

/** One `/answer` token → the answer for that question: option number(s), else free text. */
function choiceAnswer(q: AskQuestion, token: string): string | { error: string } {
  if (!/^\d+(,\d+)*$/.test(token)) return token;
  const picks = token.split(",").map((n) => q.options[Number(n) - 1]?.label);
  if (picks.some((l) => l === undefined)) return { error: `"${q.header || q.question}" has options 1–${q.options.length}` };
  if (!q.multiSelect && picks.length > 1) return { error: `"${q.header || q.question}" takes one choice` };
  return picks.join(", ");
}

/**
 * Execute one input line. Returns a status message for the footer.
 */
export async function runInput(store: StoreApi<HubState>, line: string): Promise<string> {
  const s = store.getState();
  const sel = s.selected;
  const roomId = sel?.kind === "room" ? sel.id : undefined;
  const text = line.trim();
  if (!text) return "";

  if (!text.startsWith("/")) {
    if (!sel) return "Open a room or session first (↑↓ + enter)";
    if (sel.kind === "session" && s.selectedAgent) {
      return done(await s.relayToSubagent(sel.sessionId, s.selectedAgent, "message", text), "asked the parent to relay it");
    }
    return done(await s.send(sel, text), "sent");
  }

  const [cmd = "", ...args] = text.slice(1).split(/\s+/);
  const rest = args.join(" ");
  const needRoom = "Open a room first";

  switch (cmd) {
    case "help":
    case "?":
      return HELP;
    case "room": {
      const [name, ...topic] = args;
      if (!name) return "usage: /room <name> [topic…]";
      const r = await s.createRoom({ name, topic: topic.join(" ") || undefined });
      if (!r.ok) return `✗ ${r.error}`;
      s.select({ kind: "room", id: r.data.id });
      return `created #${r.data.id}`;
    }
    case "add": {
      if (!roomId) return needRoom;
      const [ref, alias] = args;
      if (!ref) return "usage: /add <session> [alias]";
      const hit = findSession(s.sessions, ref);
      if (typeof hit === "string") return `✗ ${hit}`;
      return done(await s.addMember(roomId, hit.sessionId, alias), `added ${hit.name} to #${roomId}`);
    }
    case "remove": {
      if (!roomId) return needRoom;
      const member = s.rooms.find((r) => r.id === roomId)?.members.find((m) => m.alias === args[0]);
      if (!member) return `✗ no member @${args[0] ?? ""}`;
      return done(await s.removeMember(roomId, member.sessionId), `removed @${member.alias}`);
    }
    case "pause":
    case "resume":
      if (!roomId) return needRoom;
      return done(await s.updateRoom(roomId, { paused: cmd === "pause" }), `#${roomId} ${cmd}d`);
    case "topic":
      if (!roomId) return needRoom;
      return done(await s.updateRoom(roomId, { topic: rest }), "topic updated");
    case "spawn": {
      const [cwd, name, ...prompt] = args;
      if (!cwd || !name) return "usage: /spawn <cwd> <name> [prompt…]";
      const r = await s.spawn({
        cwd: cwd.startsWith("~/") ? `${Bun.env.HOME ?? ""}${cwd.slice(1)}` : cwd,
        name,
        prompt: prompt.join(" ") || undefined,
        roomId,
      });
      return r.ok ? `spawned ${name}${r.data.jobId ? ` (job ${r.data.jobId})` : ""}` : `✗ ${r.error}`;
    }
    case "stop": {
      if (sel?.kind !== "session") return "Open a background session first";
      const session = s.sessions.find((x) => x.sessionId === sel.sessionId);
      if (!session) return "✗ session is not running";
      return done(await s.stopSession(session.pid), `stopped ${session.name}`);
    }
    case "close": {
      const id = args[0];
      if (!id) return "usage: /close <room>";
      return done(await s.deleteRoom(id), `closed #${id}`);
    }
    case "subs": {
      if (sel?.kind !== "session") return "Open a session first";
      const subs = s.subagents[sel.sessionId] ?? [];
      if (subs.length === 0) return "No subagents";
      return subs
        .slice(0, 30)
        .map((a, i) => `${String(i + 1).padStart(2)}. ${a.active ? "●" : "○"} ${a.description || a.agentType}  (${a.agentType}, ${a.agentId})`)
        .join("\n");
    }
    case "sub": {
      if (sel?.kind !== "session") return "Open a session first";
      const subs = s.subagents[sel.sessionId] ?? [];
      const ref = args[0] ?? "";
      const hit = /^\d+$/.test(ref) ? subs[Number(ref) - 1] : subs.find((a) => a.agentId.startsWith(ref));
      if (!hit) return `✗ no subagent '${ref}' — /subs to list`;
      s.selectAgent(hit.agentId);
      return `watching ${hit.description || hit.agentId} — typing now relays through the parent`;
    }
    case "answer": {
      if (sel?.kind !== "session" || s.selectedAgent) return "Open the session that asked (not a subagent) first";
      const chat = s.transcripts[chatKey(sel.sessionId)] ?? [];
      const statuses = questionStatuses(chat);
      const open = chat.findLast((e) => e.kind === "question" && statuses.get(e.id)?.state === "open");
      if (open?.kind !== "question") return "✗ no open question in this session";
      const picks = tokens(text.slice("/answer".length));
      if (picks.length !== open.questions.length) {
        return `usage: /answer <choice per question> — this one has ${open.questions.length} question${open.questions.length > 1 ? "s" : ""}`;
      }
      const answers: Answers = {};
      for (const [i, q] of open.questions.entries()) {
        const a = choiceAnswer(q, picks[i] ?? "");
        if (typeof a !== "string") return `✗ ${a.error}`;
        answers[q.question] = a;
      }
      return done(await s.answerQuestion(sel.sessionId, open.id, answers), "answers sent — the session was interrupted to receive them");
    }
    case "main":
      s.selectAgent(null);
      return "back to the session";
    case "stopsub": {
      if (sel?.kind !== "session" || !s.selectedAgent) return "Open a subagent first (/sub <n>)";
      return done(await s.relayToSubagent(sel.sessionId, s.selectedAgent, "stop"), "asked the parent to stop it");
    }
    default:
      return `Unknown command /${cmd} — /help`;
  }
}
