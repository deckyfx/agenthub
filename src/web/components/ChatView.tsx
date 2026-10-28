import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Brain, Check, ChevronRight, Loader2, Wrench } from "lucide-react";
import type { ChatEntry } from "../../core/transcript";
import { clock } from "../lib/format";
import { cx } from "./ui";

type ResultEntry = Extract<ChatEntry, { kind: "result" }>;
type Role = "user" | "peer" | "assistant";

function roleOf(e: ChatEntry): Role {
  if (e.kind === "prompt") return e.source === "peer" ? "peer" : "user";
  return "assistant";
}

const ROLE_LABEL: Record<Role, { text: string; color: string }> = {
  user: { text: "user", color: "text-indigo-300" },
  peer: { text: "peer", color: "text-amber-300" },
  assistant: { text: "claude", color: "text-emerald-300" },
};

function Pre({ children, error }: { children: string; error?: boolean }) {
  return (
    <pre className={cx("max-h-80 overflow-auto rounded-md bg-zinc-950 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words", error ? "text-rose-300" : "text-zinc-400")}>
      {children || "(empty)"}
    </pre>
  );
}

/** A tool call, collapsed to one line; expands to its input and output. */
function ToolCall({ entry, result, running }: { entry: Extract<ChatEntry, { kind: "tool" }>; result?: ResultEntry; running: boolean }) {
  const status = result ? (
    result.isError ? <AlertTriangle className="size-3.5 text-rose-400" /> : <Check className="size-3.5 text-emerald-500" />
  ) : running ? (
    <Loader2 className="size-3.5 animate-spin text-amber-400" />
  ) : (
    <span className="size-3.5" />
  );
  return (
    <details className="group my-0.5 rounded-md border border-zinc-800/80 bg-zinc-900/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
        <Wrench className="size-3 shrink-0 text-zinc-500" />
        <span className="font-mono font-medium text-zinc-300">{entry.name}</span>
        <span className="min-w-0 flex-1 truncate">{entry.summary}</span>
        {status}
      </summary>
      <div className="space-y-2 border-t border-zinc-800 p-2">
        <Pre>{entry.input}</Pre>
        {result && <Pre error={result.isError}>{result.text}</Pre>}
      </div>
    </details>
  );
}

function Thinking({ text }: { text: string }) {
  return (
    <details className="group my-0.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs italic text-zinc-500 hover:text-zinc-300">
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
        <Brain className="size-3" /> thinking
      </summary>
      <p className="mt-1 border-l-2 border-zinc-800 pl-3 text-xs whitespace-pre-wrap text-zinc-500 italic">{text}</p>
    </details>
  );
}

/**
 * A Claude Code conversation rendered from its transcript: prompts, peer
 * messages, replies, thinking, and tool calls paired with their results.
 * Sticks to the bottom unless the reader scrolled up.
 */
export function ChatView({ entries, busy, empty }: { entries: ChatEntry[] | undefined; busy: boolean; empty: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const { items, results } = useMemo(() => {
    const results = new Map<string, ResultEntry>();
    const items: ChatEntry[] = [];
    for (const e of entries ?? []) {
      if (e.kind === "result") results.set(e.toolUseId, e);
      else items.push(e);
    }
    return { items, results };
  }, [entries]);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries, busy]);

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto px-4 py-2"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {entries === undefined && <p className="p-6 text-center text-sm text-zinc-600">Loading transcript…</p>}
      {entries?.length === 0 && <p className="p-6 text-center text-sm text-zinc-600">{empty}</p>}
      {items.map((e, i) => {
        const role = roleOf(e);
        const prev = items[i - 1];
        const header = !prev || roleOf(prev) !== role || e.kind === "prompt";
        const label = ROLE_LABEL[role];
        return (
          <div key={e.id} className={cx(header && "mt-3")}>
            {header && (
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className={cx("text-xs font-semibold", label.color)}>
                  {e.kind === "prompt" && e.source === "peer" ? `↘ ${e.from ?? "peer"}` : label.text}
                </span>
                <span className="text-[11px] text-zinc-600">{clock(e.ts)}</span>
              </div>
            )}
            {e.kind === "prompt" && (
              <p className={cx("rounded-md px-3 py-2 text-sm whitespace-pre-wrap break-words", e.source === "peer" ? "bg-amber-500/5 text-zinc-200" : "bg-indigo-500/10 text-zinc-100")}>
                {e.text}
              </p>
            )}
            {e.kind === "text" && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-200">{e.text}</p>}
            {e.kind === "thinking" && <Thinking text={e.text} />}
            {e.kind === "tool" && <ToolCall entry={e} result={results.get(e.id)} running={busy && i >= items.length - 3} />}
          </div>
        );
      })}
      {busy && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400/80">
          <Loader2 className="size-3.5 animate-spin" /> working…
        </div>
      )}
    </div>
  );
}
