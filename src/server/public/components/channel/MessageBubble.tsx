import React, { useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { cn, senderStyle } from "../ui";
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
export function MessageBubble({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false);
  const from = msg.from_alias ?? msg.from_agent;
  const style = senderStyle(from);
  const typeChip = TYPE_CHIP[msg.type] ?? TYPE_CHIP.message!;
  const ts = new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let body = msg.payload;
  try { body = JSON.stringify(JSON.parse(msg.payload), null, 2); } catch { /* keep raw */ }
  const long = msg.payload.length > 220 || msg.payload.includes("\n");

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
            {ts}
            <StatusCheck status={msg.status} />
          </span>
        </div>
        <button onClick={() => long && setExpanded((v) => !v)} className={cn("block w-full text-left text-sm text-zinc-300", long && "cursor-pointer")}>
          {expanded || !long ? (
            <pre className="whitespace-pre-wrap break-words font-sans">{body}</pre>
          ) : (
            <span className="line-clamp-2 whitespace-pre-wrap break-words">{msg.payload}</span>
          )}
        </button>
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
