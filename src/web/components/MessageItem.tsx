import { AlertTriangle, Check, Clock } from "lucide-react";
import type { MessageWithDeliveries } from "../../stores/message-store";
import { clock, senderColor } from "../lib/format";
import { cx } from "./ui";

/** Highlight `@mentions` and `#rooms` in a body. */
function Body({ text }: { text: string }) {
  const parts = text.split(/((?:^|(?<=\s))[@#][a-z0-9][a-z0-9-]*)/gi);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
      {parts.map((p, i) =>
        /^[@#][a-z0-9]/i.test(p) ? (
          <span key={i} className="rounded bg-indigo-500/15 px-0.5 text-indigo-300">{p}</span>
        ) : (
          p
        ),
      )}
    </p>
  );
}

/** Per-recipient delivery summary. */
function Deliveries({ message, names }: { message: MessageWithDeliveries; names: (sessionId: string) => string }) {
  const ds = message.deliveries;
  if (ds.length === 0) return null;
  const sent = ds.filter((d) => d.status === "sent").length;
  const failed = ds.filter((d) => d.status === "failed");
  const pending = ds.filter((d) => d.status === "pending");
  const title = ds.map((d) => `${names(d.sessionId)}: ${d.status}${d.error ? ` — ${d.error}` : ""}`).join("\n");
  return (
    <span className="flex items-center gap-2 text-[11px] text-zinc-500" title={title}>
      {sent > 0 && (
        <span className="flex items-center gap-0.5">
          <Check className="size-3" /> {sent}/{ds.length}
        </span>
      )}
      {pending.length > 0 && (
        <span className="flex items-center gap-0.5 text-amber-400/80">
          <Clock className="size-3" /> {pending.length} queued
        </span>
      )}
      {failed.length > 0 && (
        <span className="flex items-center gap-0.5 text-rose-400">
          <AlertTriangle className="size-3" /> {failed.length} failed
        </span>
      )}
    </span>
  );
}

/** One feed entry. `grouped` = same sender as the previous one (no header). */
export function MessageItem({ message, grouped, names }: { message: MessageWithDeliveries; grouped: boolean; names: (sessionId: string) => string }) {
  if (message.senderKind === "hub") {
    return <div className="px-4 py-1 text-center text-xs italic text-zinc-500">{message.body}</div>;
  }
  const isOperator = message.senderKind === "operator";
  const label = isOperator ? "you" : message.roomId ? `@${message.senderLabel}` : message.senderLabel;
  return (
    <div className={cx("group px-4 hover:bg-zinc-900/50", grouped ? "py-0.5" : "pt-3 pb-0.5")}>
      {!grouped && (
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className={cx("text-sm font-semibold", isOperator ? "text-indigo-300" : senderColor(message.senderLabel))}>{label}</span>
          <span className="text-[11px] text-zinc-600">{clock(message.createdAt)}</span>
        </div>
      )}
      <Body text={message.body} />
      <div className="flex h-4 items-center">
        <Deliveries message={message} names={names} />
      </div>
    </div>
  );
}
