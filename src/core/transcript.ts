import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Glob } from "bun";
import { envConfig } from "../env-config";
import { catchError, catchSync } from "../lib/error-handler";
import { TypedEmitter } from "../lib/emitter";
import { parseEnvelope } from "./peer-protocol";

/**
 * Live view of a session's conversation, read from the transcript Claude Code
 * appends to `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl`.
 *
 * Like the peer protocol this is an internal format (Claude Code 2.1.31x);
 * everything that knows its shape lives in this file.
 */

/** Cap on text carried per entry; transcripts can hold megabytes of tool output. */
const MAX_TEXT = 4000;
/** Bytes read from the end of a transcript to build the initial history. */
const HISTORY_BYTES = 1_500_000;

/** One normalized item of a session's conversation. */
export type ChatEntry =
  | { kind: "prompt"; id: string; ts: number; text: string; source: "human" | "peer"; from?: string }
  | { kind: "text"; id: string; ts: number; text: string }
  | { kind: "thinking"; id: string; ts: number; text: string }
  | { kind: "tool"; id: string; ts: number; name: string; summary: string; input: string }
  | { kind: "result"; id: string; ts: number; toolUseId: string; text: string; isError: boolean };

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more chars)` : text;
}

/** Strip harness-injected wrappers from a human prompt (reminders, IDE context). */
function cleanPrompt(text: string): string {
  return text
    .replace(/<(system-reminder|ide_selection|ide_opened_file|pasted_content)[^>]*>[\s\S]*?<\/\1[^>]*>/g, "")
    .trim();
}

/** One-line description of a tool call: its stated purpose, else its main argument. */
function toolSummary(input: unknown): string {
  if (!isObj(input)) return "";
  for (const key of ["description", "command", "file_path", "pattern", "url", "query", "prompt", "to", "skill"]) {
    const v = str(input[key]);
    if (v) return v.replace(/\s+/g, " ").slice(0, 160);
  }
  const first = Object.values(input).find((v) => typeof v === "string");
  return typeof first === "string" ? first.replace(/\s+/g, " ").slice(0, 160) : "";
}

/** Flatten a tool_result's content (string or blocks) into text. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (isObj(b) ? (b.type === "text" ? (str(b.text) ?? "") : b.type === "image" ? "[image]" : "") : ""))
    .join("\n");
}

/** A prompt that arrived from another session / the hub. */
function peerPrompt(id: string, ts: number, raw: string, origin: Json | undefined): ChatEntry {
  const env = parseEnvelope(raw);
  return {
    kind: "prompt",
    id,
    ts,
    source: "peer",
    from: str(origin?.name) ?? env.fromName ?? env.from,
    text: clip(str(origin?.body) ?? env.body),
  };
}

/**
 * Normalize one transcript record into zero or more chat entries. Unknown
 * record types (bookkeeping, snapshots, API metadata) yield nothing.
 */
export function parseRecord(rec: unknown, opts: { sidechain?: boolean } = {}): ChatEntry[] {
  // Sidechain records belong to subagents; only a subagent's own file wants them.
  if (!isObj(rec) || (rec.isSidechain === true && !opts.sidechain)) return [];
  const uuid = str(rec.uuid) ?? crypto.randomUUID();
  const ts = Date.parse(str(rec.timestamp) ?? "") || Date.now();
  const origin = isObj(rec.origin) ? rec.origin : undefined;

  // Messages queued while the session was mid-turn (peer messages, typed follow-ups).
  if (rec.type === "attachment" && isObj(rec.attachment) && rec.attachment.type === "queued_command") {
    const a = rec.attachment;
    const prompt = str(a.prompt) ?? "";
    const aOrigin = isObj(a.origin) ? a.origin : undefined;
    if (aOrigin?.kind === "peer") return [peerPrompt(uuid, ts, prompt, aOrigin)];
    const text = cleanPrompt(prompt);
    return text ? [{ kind: "prompt", id: uuid, ts, source: "human", text: clip(text) }] : [];
  }

  const message = isObj(rec.message) ? rec.message : undefined;
  if (!message) return [];

  if (rec.type === "user") {
    if (origin?.kind === "peer") {
      const raw = typeof message.content === "string" ? message.content : resultText(message.content);
      return [peerPrompt(uuid, ts, raw, origin)];
    }
    if (rec.isMeta === true) return []; // skill bodies, injected context
    if (typeof message.content === "string") {
      const text = cleanPrompt(message.content);
      return text ? [{ kind: "prompt", id: uuid, ts, source: "human", text: clip(text) }] : [];
    }
    if (!Array.isArray(message.content)) return [];
    const out: ChatEntry[] = [];
    message.content.forEach((b, i) => {
      if (!isObj(b)) return;
      if (b.type === "tool_result") {
        out.push({
          kind: "result",
          id: `${uuid}:${i}`,
          ts,
          toolUseId: str(b.tool_use_id) ?? "",
          text: clip(resultText(b.content)),
          isError: b.is_error === true,
        });
      } else if (b.type === "text") {
        const text = cleanPrompt(str(b.text) ?? "");
        if (text) out.push({ kind: "prompt", id: `${uuid}:${i}`, ts, source: "human", text: clip(text) });
      }
    });
    return out;
  }

  if (rec.type === "assistant" && Array.isArray(message.content)) {
    const out: ChatEntry[] = [];
    message.content.forEach((b, i) => {
      if (!isObj(b)) return;
      const id = `${uuid}:${i}`;
      if (b.type === "text" && str(b.text)?.trim()) out.push({ kind: "text", id, ts, text: clip(str(b.text) ?? "") });
      else if (b.type === "thinking" && str(b.thinking)?.trim()) out.push({ kind: "thinking", id, ts, text: clip(str(b.thinking) ?? "") });
      else if (b.type === "tool_use") {
        out.push({
          kind: "tool",
          id: str(b.id) ?? id,
          ts,
          name: str(b.name) ?? "tool",
          summary: toolSummary(b.input),
          input: clip(JSON.stringify(b.input ?? {}, null, 2)),
        });
      }
    });
    return out;
  }
  return [];
}

/** Parse newline-delimited records; a torn or foreign line is skipped. */
function parseLines(text: string, sidechain: boolean): ChatEntry[] {
  const out: ChatEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [err, rec] = catchSync((): unknown => JSON.parse(line));
    if (!err) out.push(...parseRecord(rec, { sidechain }));
  }
  return out;
}

/** True for a subagent transcript (`…/<sessionId>/subagents/agent-<id>.jsonl`). */
const isSubagentPath = (path: string) => basename(dirname(path)) === "subagents";

const projectsDir = () => join(envConfig.CLAUDE_CONFIG_DIR, "projects");

/**
 * Locate a session's transcript. Tries Claude Code's cwd encoding first
 * (every non-alphanumeric → `-`), then searches all project folders.
 */
export async function findTranscript(sessionId: string, cwd?: string): Promise<string | undefined> {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) return undefined;
  if (cwd) {
    const guess = join(projectsDir(), cwd.replace(/[^A-Za-z0-9]/g, "-"), `${sessionId}.jsonl`);
    if (await Bun.file(guess).exists()) return guess;
  }
  const [err, hits] = await catchError(
    Array.fromAsync(new Glob(`*/${sessionId}.jsonl`).scan({ cwd: projectsDir(), onlyFiles: true })),
  );
  return !err && hits[0] ? join(projectsDir(), hits[0]) : undefined;
}

/** The last `limit` chat entries of a transcript (reads only its tail). */
export async function readHistory(path: string, limit = 400): Promise<ChatEntry[]> {
  const file = Bun.file(path);
  const size = file.size;
  const start = Math.max(0, size - HISTORY_BYTES);
  let text = await file.slice(start, size).text();
  if (start > 0) text = text.slice(text.indexOf("\n") + 1); // drop the torn first line
  return parseLines(text, isSubagentPath(path)).slice(-limit);
}

// ─── Subagents ────────────────────────────────────────────────────────────────

/** A subagent a session launched (Agent / Task tool), from its `.meta.json`. */
export interface SubagentInfo {
  agentId: string;
  /** `general-purpose`, `Explore`, a custom agent name, … */
  agentType: string;
  description: string;
  /** Launched to run in the background (the parent kept working). */
  background: boolean;
  /** Last transcript write. */
  updatedAt: number;
  /** Wrote within the last {@link ACTIVE_MS} — a good proxy for "still running". */
  active: boolean;
}

const ACTIVE_MS = 30_000;
const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `<projects>/<cwd>/<sessionId>/subagents` for a session's main transcript. */
function subagentDir(mainTranscript: string): string {
  return join(dirname(mainTranscript), basename(mainTranscript, ".jsonl"), "subagents");
}

/** Path of one subagent's transcript, or undefined for a malformed id. */
export function subagentTranscript(mainTranscript: string, agentId: string): string | undefined {
  return AGENT_ID.test(agentId) ? join(subagentDir(mainTranscript), `agent-${agentId}.jsonl`) : undefined;
}

/** Every subagent a session has launched, most recently active first. */
export async function listSubagents(mainTranscript: string): Promise<SubagentInfo[]> {
  const dir = subagentDir(mainTranscript);
  const [err, files] = await catchError(Array.fromAsync(new Glob("agent-*.jsonl").scan({ cwd: dir, onlyFiles: true })));
  if (err) return [];
  const now = Date.now();
  const out = await Promise.all(
    files.map(async (file): Promise<SubagentInfo | undefined> => {
      const agentId = file.slice("agent-".length, -".jsonl".length);
      const [statErr, st] = await catchError(stat(join(dir, file)));
      if (statErr) return undefined;
      const [, meta] = await catchError(Bun.file(join(dir, `agent-${agentId}.meta.json`)).json() as Promise<Json>);
      const updatedAt = st.mtimeMs;
      return {
        agentId,
        agentType: str(meta?.agentType) ?? "agent",
        description: str(meta?.description) ?? "",
        background: meta?.requestShape === "background",
        updatedAt,
        active: now - updatedAt < ACTIVE_MS,
      };
    }),
  );
  return out.filter((x): x is SubagentInfo => x !== undefined).sort((a, b) => b.updatedAt - a.updatedAt);
}

interface TailEvents extends Record<string, unknown> {
  entries: ChatEntry[];
}

/**
 * Follow a transcript as Claude Code appends to it. Emits only entries
 * written after {@link start}; pair with {@link readHistory} for the backlog.
 * Waits for the file to appear if the session hasn't written one yet.
 */
export class TranscriptTail extends TypedEmitter<TailEvents> {
  private path: string | undefined;
  private offset = 0;
  private watcher: FSWatcher | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private reading = false;

  /**
   * @param label for log lines
   * @param resolve finds the file to follow (retried until it exists)
   */
  constructor(
    private readonly label: string,
    private readonly resolve: () => Promise<string | undefined>,
  ) {
    super();
  }

  async start(): Promise<void> {
    await this.attach();
    // fs.watch can miss appends; a light poll keeps the stream honest.
    this.timer = setInterval(() => void this.poll(), 1000);
  }

  stop(): void {
    this.watcher?.close();
    if (this.timer) clearInterval(this.timer);
  }

  private async attach(): Promise<void> {
    if (this.path) return;
    const path = await this.resolve();
    if (!path || !(await Bun.file(path).exists())) return;
    this.path = path;
    this.offset = Bun.file(this.path).size;
    const [err, w] = catchSync(() => watch(this.path ?? "", () => void this.poll()));
    if (!err) this.watcher = w;
  }

  private async poll(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    await this.attach();
    if (this.path) {
      const [err] = await catchError(this.readNew(this.path));
      if (err) console.warn(`[transcript] ${this.label}: ${err.message}`);
    }
    this.reading = false;
  }

  /** Read complete lines appended since the last read. */
  private async readNew(path: string): Promise<void> {
    const size = Bun.file(path).size;
    if (size < this.offset) this.offset = 0; // rewritten / truncated
    if (size === this.offset) return;
    const bytes = new Uint8Array(await Bun.file(path).slice(this.offset, size).arrayBuffer());
    // Advance only past the last newline: a half-written line waits, and
    // since `\n` is one byte, cutting there never splits a UTF-8 character.
    const end = bytes.lastIndexOf(0x0a);
    if (end === -1) return;
    this.offset += end + 1;
    const entries = parseLines(new TextDecoder().decode(bytes.subarray(0, end)), isSubagentPath(path));
    if (entries.length > 0) this.emit("entries", entries);
  }
}
