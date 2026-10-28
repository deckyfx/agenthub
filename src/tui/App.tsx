import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, usePaste, useWindowSize } from "ink";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { threadKey, type HubState, type Thread } from "../lib/hub-store";
import type { MessageWithDeliveries } from "../stores/message-store";
import type { ChatEntry } from "../core/transcript";
import { chatKey } from "../core/chat-key";
import { questionStatuses, splitAnswer, type AskQuestion, type QuestionStatus } from "../core/questions";
import { runInput } from "./commands";

const SIDEBAR_WIDTH = 34;
const SENDER_COLORS = ["cyan", "green", "yellow", "magenta", "blue", "redBright", "greenBright", "cyanBright"] as const;

/** One selectable sidebar row. */
type Entry = { thread: Thread; label: string; detail: string; dot: string; dotColor: string; unread: number };

/** A rendered feed line. */
type Line = { text: string; color?: string; bold?: boolean; dim?: boolean };

function senderColor(label: string): string {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length] ?? "white";
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Hard-wrap a string to `width` columns. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.length === 0) out.push("");
    for (let i = 0; i < raw.length; i += width) out.push(raw.slice(i, i + width));
  }
  return out;
}

/** Flatten messages into wrapped, styled lines. */
function feedLines(messages: MessageWithDeliveries[], width: number): Line[] {
  const lines: Line[] = [];
  for (const m of messages) {
    if (m.senderKind === "hub") {
      for (const l of wrap(`— ${m.body}`, width)) lines.push({ text: l, dim: true });
      continue;
    }
    const who = m.senderKind === "operator" ? "you" : m.roomId ? `@${m.senderLabel}` : m.senderLabel;
    const pending = m.deliveries.filter((d) => d.status === "pending").length;
    const failed = m.deliveries.filter((d) => d.status === "failed").length;
    const flags = `${pending ? ` ⧗${pending}` : ""}${failed ? ` ✗${failed}` : ""}`;
    lines.push({ text: `${hhmm(m.createdAt)} ${who}${flags}`, color: m.senderKind === "operator" ? "blueBright" : senderColor(m.senderLabel), bold: true });
    for (const l of wrap(m.body, width - 2)) lines.push({ text: `  ${l}` });
  }
  return lines;
}

/** An AskUserQuestion: each question with numbered options; picked ones ticked once answered. */
function questionLines(questions: AskQuestion[], status: QuestionStatus, width: number, answerable: boolean): Line[] {
  const lines: Line[] = [];
  const tag = status.state === "open" ? "waiting for an answer" : status.state === "answered" ? `answered ${status.via === "hub" ? "from AgentHub" : "in the session"}` : "dismissed";
  lines.push({ text: `  ? Claude asked — ${tag}`, color: status.state === "open" ? "yellow" : status.state === "answered" ? "green" : "gray", bold: true });
  for (const q of questions) {
    const settled = status.state === "answered" ? splitAnswer(q, status.answers[q.question] ?? "") : undefined;
    const head = `${q.header ? `[${q.header}] ` : ""}${q.question}${q.multiSelect ? " (pick any)" : ""}`;
    for (const l of wrap(head, width - 4)) lines.push({ text: `    ${l}`, bold: true });
    q.options.forEach((o, i) => {
      const picked = settled?.picked.has(o.label) === true;
      const text = `${picked ? "✓" : " "} ${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`;
      lines.push({ text: `     ${text}`.slice(0, width), color: picked ? "green" : undefined, dim: settled !== undefined && !picked });
    });
    if (settled?.other) for (const l of wrap(`✓ ${settled.other}`, width - 5)) lines.push({ text: `     ${l}`, color: "green" });
  }
  if (status.state === "dismissed" && status.reason) lines.push({ text: `    ${status.reason}`.slice(0, width), dim: true });
  if (status.state === "open") {
    lines.push(
      answerable
        ? { text: `    /answer <choice per question>  e.g. /answer 1 2 · multi 1,3 · own text "…"`.slice(0, width), color: "yellow" }
        : { text: "    waiting for the session's user", dim: true },
    );
  }
  return lines;
}

/** Render a live chat (transcript) as wrapped, styled lines. */
function chatLines(entries: ChatEntry[], width: number, busy: boolean, answerable: boolean): Line[] {
  const lines: Line[] = [];
  const results = new Map<string, Extract<ChatEntry, { kind: "result" }>>();
  for (const e of entries) if (e.kind === "result") results.set(e.toolUseId, e);
  const questions = questionStatuses(entries);
  let lastRole = "";
  for (const e of entries) {
    if (e.kind === "result") continue;
    const role = e.kind === "prompt" ? e.source : "assistant";
    if (e.kind === "prompt" && e.answersFor) {
      lines.push({ text: `  ✓ answers to the question above, sent from AgentHub`, dim: true });
    } else if (e.kind === "prompt") {
      const head = e.source === "peer" ? `↘ ${e.from ?? "peer"}` : "▶ user";
      lines.push({ text: `${hhmm(e.ts)} ${head}`, color: e.source === "peer" ? "yellow" : "blueBright", bold: true });
      for (const l of wrap(e.text, width - 2)) lines.push({ text: `  ${l}` });
    } else {
      if (role !== lastRole) lines.push({ text: `${hhmm(e.ts)} ◆ claude`, color: "green", bold: true });
      if (e.kind === "text") for (const l of wrap(e.text, width - 2)) lines.push({ text: `  ${l}` });
      else if (e.kind === "thinking") lines.push({ text: `  … thinking (${e.text.length} chars)`, dim: true });
      else if (e.kind === "question") lines.push(...questionLines(e.questions, questions.get(e.id) ?? { state: "open" }, width, answerable));
      else {
        const r = results.get(e.id);
        const mark = r ? (r.isError ? " ✗" : " ✓") : busy ? " …" : "";
        lines.push({ text: `  ⚙ ${e.name} ${e.summary}${mark}`.slice(0, width), color: r?.isError ? "red" : "cyan" });
      }
    }
    lastRole = role;
  }
  if (busy) lines.push({ text: "  working…", color: "yellow", dim: true });
  return lines;
}

/**
 * Terminal dashboard. Tab switches focus between the sidebar and the input;
 * the input sends to the open thread or runs `/commands`.
 */
export function TuiApp({ store, startedServer }: { store: StoreApi<HubState>; startedServer: boolean }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const connected = useStore(store, (s) => s.connected);
  const sessions = useStore(store, (s) => s.sessions);
  const rooms = useStore(store, (s) => s.rooms);
  const unread = useStore(store, (s) => s.unread);
  const selected = useStore(store, (s) => s.selected);
  const threads = useStore(store, (s) => s.threads);
  const notices = useStore(store, (s) => s.notices);
  const health = useStore(store, (s) => s.health);
  const transcripts = useStore(store, (s) => s.transcripts);
  const subagents = useStore(store, (s) => s.subagents);
  const selectedAgent = useStore(store, (s) => s.selectedAgent);

  const [focus, setFocus] = useState<"nav" | "input">("nav");
  const [cursor, setCursor] = useState(0);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState(startedServer ? "Started an AgentHub server for this TUI; it stops when you quit" : "");
  const [panel, setPanel] = useState<string | null>(null);
  const [scroll, setScroll] = useState(0);

  const entries = useMemo<Entry[]>(
    () => [
      ...rooms.map((r) => ({
        thread: { kind: "room", id: r.id } as Thread,
        label: `#${r.id}`,
        detail: `${r.members.filter((m) => m.online).length}/${r.members.length}${r.paused ? " paused" : ""}`,
        dot: "#",
        dotColor: r.paused ? "yellow" : "gray",
        unread: unread[`room:${r.id}`] ?? 0,
      })),
      ...sessions.map((s) => ({
        thread: { kind: "session", sessionId: s.sessionId } as Thread,
        label: s.name,
        detail: s.project,
        dot: "●",
        dotColor: s.status === "busy" ? "yellow" : s.status === "idle" ? "green" : "gray",
        unread: unread[`dm:${s.sessionId}`] ?? 0,
      })),
    ],
    [rooms, sessions, unread],
  );

  useEffect(() => {
    if (cursor >= entries.length) setCursor(Math.max(0, entries.length - 1));
  }, [entries.length, cursor]);

  const open = (thread: Thread) => {
    store.getState().select(thread);
    setScroll(0);
    setPanel(null);
    setFocus("input");
  };

  const submit = async () => {
    const line = input;
    setInput("");
    const result = await runInput(store, line);
    if (result.includes("\n")) setPanel(result);
    else setStatus(result);
    setScroll(0);
  };

  usePaste((text) => {
    if (focus === "input") setInput((v) => v + text.replace(/\r?\n/g, " "));
  });

  useInput((ch, key) => {
    if (key.tab) return setFocus((f) => (f === "nav" ? "input" : "nav"));
    if (key.pageUp) return setScroll((s) => s + 10);
    if (key.pageDown) return setScroll((s) => Math.max(0, s - 10));
    if (panel && (key.escape || key.return)) return setPanel(null);

    if (focus === "nav") {
      if (ch === "q") return exit();
      if (key.upArrow || ch === "k") return setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow || ch === "j") return setCursor((c) => Math.min(entries.length - 1, c + 1));
      if (key.return) {
        const e = entries[cursor];
        if (e) open(e.thread);
        return;
      }
      if (ch === "/" || ch === "?") {
        setFocus("input");
        setInput(ch === "?" ? "/help" : "/");
      }
      return;
    }

    // input focus
    if (key.escape) return setFocus("nav");
    if (key.return) return void submit();
    if (key.backspace || key.delete) return setInput((v) => v.slice(0, -1));
    if (key.ctrl && ch === "u") return setInput("");
    if (key.upArrow) return setScroll((s) => s + 1);
    if (key.downArrow) return setScroll((s) => Math.max(0, s - 1));
    if (ch && !key.ctrl && !key.meta) setInput((v) => v + ch);
  });

  // ─── Layout maths ───────────────────────────────────────────────────────────
  const mainWidth = Math.max(20, columns - SIDEBAR_WIDTH - 4);
  const bodyHeight = Math.max(5, rows - 7); // header + input box + footer
  const key = selected ? threadKey(selected) : undefined;
  const room = selected?.kind === "room" ? rooms.find((r) => r.id === selected.id) : undefined;
  const session = selected?.kind === "session" ? sessions.find((s) => s.sessionId === selected.sessionId) : undefined;
  const sessionId = selected?.kind === "session" ? selected.sessionId : undefined;
  const subs = sessionId ? (subagents[sessionId] ?? []) : [];
  const agent = subs.find((a) => a.agentId === selectedAgent);
  const title = room
    ? `#${room.id}${room.topic ? ` — ${room.topic}` : ""}${room.paused ? " [paused]" : ""}`
    : session
      ? `${session.name} · ${session.cwd} · pid ${session.pid} · ${session.status}${agent ? `  ▸ subagent: ${agent.description || agent.agentId}` : ""}`
      : selected
        ? "offline session"
        : "AgentHub — pick a room or session";
  const subtitle = room
    ? `members: @operator ${room.members.map((m) => `@${m.alias}${m.online ? "" : "(off)"}`).join(" ")}`
    : subs.length > 0
      ? `live chat · ${subs.length} subagents (${subs.filter((a) => a.active).length} active) — /subs · /sub <n> · /main`
      : sessionId
        ? "live chat"
        : "";

  const lines = panel
    ? panel.split("\n").map((t) => ({ text: t, color: "white" }) as Line)
    : sessionId
      ? chatLines(transcripts[chatKey(sessionId, selectedAgent ?? undefined)] ?? [], mainWidth, agent ? agent.active : session?.status === "busy", !!session && !agent)
      : key
        ? feedLines(threads[key] ?? [], mainWidth)
        : [
          { text: `${sessions.length} live sessions · ${rooms.length} rooms`, bold: true },
          { text: "" },
          { text: "↑↓/jk select · enter open · tab focus input · / command · ? help · q quit", dim: true },
          { text: "" },
          { text: `Hub address: ${health?.address ?? "…"}`, dim: true },
        ];
  const feedHeight = bodyHeight - (subtitle ? 3 : 2);
  const maxScroll = Math.max(0, lines.length - feedHeight);
  const offset = Math.min(scroll, maxScroll);
  const visible = lines.slice(Math.max(0, lines.length - feedHeight - offset), lines.length - offset);

  // Sidebar windowing around the cursor.
  const navHeight = bodyHeight - 2;
  const navStart = Math.max(0, Math.min(cursor - Math.floor(navHeight / 2), entries.length - navHeight));
  const navRows = entries.slice(navStart, navStart + navHeight);
  const firstSession = rooms.length;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box paddingX={1}>
        <Text bold color="blueBright">AgentHub </Text>
        <Text color={connected ? "green" : "red"}>{connected ? "● live" : "● offline"}</Text>
        <Text dimColor>  {sessions.length} sessions · {rooms.length} rooms{health ? `  v${health.version}` : ""}</Text>
      </Box>

      <Box height={bodyHeight}>
        <Box flexDirection="column" width={SIDEBAR_WIDTH} borderStyle="round" borderColor={focus === "nav" ? "blueBright" : "gray"}>
          {entries.length === 0 && <Text dimColor> no rooms or sessions</Text>}
          {navRows.map((e, i) => {
            const idx = navStart + i;
            const active = idx === cursor;
            const isOpen = key !== undefined && threadKey(e.thread) === key;
            const header = idx === 0 && rooms.length > 0 ? "ROOMS" : idx === firstSession ? "SESSIONS" : null;
            return (
              <Box key={threadKey(e.thread)} flexDirection="column">
                {header && <Text dimColor bold> {header}</Text>}
                <Text wrap="truncate-end" inverse={active && focus === "nav"} bold={isOpen}>
                  <Text color={e.dotColor}>{` ${e.dot} `}</Text>
                  {e.label}
                  <Text dimColor>{` ${e.detail}`}</Text>
                  {e.unread > 0 && <Text color="magentaBright">{` (${e.unread})`}</Text>}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold wrap="truncate-end">{title}</Text>
          {subtitle && <Text dimColor wrap="truncate-end">{subtitle}</Text>}
          <Box flexDirection="column" flexGrow={1}>
            {visible.map((l, i) => (
              <Text key={i} color={l.color} bold={l.bold} dimColor={l.dim} wrap="truncate-end">
                {l.text || " "}
              </Text>
            ))}
          </Box>
          {offset > 0 && <Text dimColor>↓ {offset} more (PgDn)</Text>}
        </Box>
      </Box>

      <Box borderStyle="round" borderColor={focus === "input" ? "blueBright" : "gray"} paddingX={1}>
        <Text color="blueBright">{"> "}</Text>
        <Text wrap="truncate-start">
          {input || (focus === "input" ? "" : <Text dimColor>tab to type · / for commands</Text>)}
          {focus === "input" && <Text inverse> </Text>}
        </Text>
      </Box>

      <Box paddingX={1}>
        {notices.length > 0 ? (
          <Text color={notices.at(-1)?.level === "warn" ? "yellow" : "green"} wrap="truncate-end">
            {notices.at(-1)?.text}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">{status || "tab focus · ↑↓ select · enter open · PgUp/PgDn scroll · /help · q quit"}</Text>
        )}
      </Box>
    </Box>
  );
}
