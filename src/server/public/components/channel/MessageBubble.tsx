import React, { useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { cn, senderStyle } from "../ui";
import { renderMentions } from "../../lib/mentions";
import type { Message } from "../../../../db/schema";

/** Accent color per message type (text + subtle background chip). */
const TYPE_CHIP: Record<string, string> = {
  task: "bg-sky-500/15 text-sky-300",
  result: "bg-emerald-500/15 text-emerald-300",
  question: "bg-amber-500/15 text-amber-300",
  answer: "bg-amber-400/15 text-amber-200",
  command: "bg-violet-500/15 text-violet-300",
  context: "bg-cyan-500/15 text-cyan-300",
  status: "bg-zinc-500/15 text-zinc-300",
  message: "bg-zinc-500/15 text-zinc-400",
  note: "bg-zinc-500/15 text-zinc-400",
};

/**
 * A single chat message rendered with the sender's color identity: a Google-style
 * colored initial avatar on the left, then sender name, type, time and a
 * delivery check. Long payloads are collapsed and expand on click.
 */
/** "#186" for a single row, "#186–189" for a fanned-out (multi-recipient) message. */
function idLabel(ids?: number[]): string | null {
  if (!ids || ids.length === 0) return null;
  if (ids.length === 1) return `#${ids[0]}`;
  return `#${ids[0]}–${ids[ids.length - 1]}`;
}

export function MessageBubble({
  msg,
  ids,
  onMentionClick,
}: {
  msg: Message;
  /** Ids of every per-recipient row this bubble collapses (for referencing). */
  ids?: number[];
  /** Called with a bare alias when an @mention in the body is clicked. */
  onMentionClick?: (alias: string) => void;
}) {
  const idText = idLabel(ids);
  const [expanded, setExpanded] = useState(false);
  const from = msg.from_alias ?? msg.from_agent;
  const style = senderStyle(from);
  const typeChip = TYPE_CHIP[msg.type] ?? TYPE_CHIP.message!;
  const ts = new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let body = msg.payload;
  try { body = JSON.stringify(JSON.parse(msg.payload), null, 2); } catch { /* keep raw */ }
  const long = msg.payload.length > 220 || msg.payload.includes("\n");
  // Collapsed long messages show the raw payload (clamped); expanded shows the
  // prettified body. Mentions are highlighted in both.
  const shown = expanded || !long ? body : msg.payload;

  return (
    <div className={cn("flex gap-3 rounded-xl border-l-2 py-2 pl-2.5 pr-3", style.bubble, style.border)}>
      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", style.avatar)}>
        {from.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className={cn("text-sm font-semibold", style.text)}>{from}</span>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", typeChip)}>
            {msg.type}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-zinc-600">
            {idText && (
              <span
                className="select-all font-mono text-zinc-500"
                title={ids && ids.length > 1 ? `Message ids: ${ids.join(", ")}` : undefined}
              >
                {idText}
              </span>
            )}
            {ts}
            <StatusCheck status={msg.status} />
          </span>
        </div>
        <pre
          className={cn(
            "whitespace-pre-wrap break-words font-sans text-sm text-zinc-300",
            !expanded && long && "line-clamp-2",
          )}
        >
          {renderMentions(shown, onMentionClick)}
        </pre>
        {long && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * WhatsApp-style delivery indicator:
 *   pending → single grey check · read → double green check · done → double check.
 */
function StatusCheck({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={15} className="text-emerald-400" />;
  if (status === "done") return <CheckCheck size={15} className="text-emerald-500" />;
  return <Check size={15} className="text-zinc-500" />;
}
