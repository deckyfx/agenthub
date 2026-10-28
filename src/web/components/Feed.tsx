import { useEffect, useRef } from "react";
import type { MessageWithDeliveries } from "../../stores/message-store";
import { MessageItem } from "./MessageItem";

/** Consecutive messages from one sender within this window share a header. */
const GROUP_MS = 5 * 60_000;

/** Scrolling message list that sticks to the bottom unless the reader scrolled up. */
export function Feed({ messages, names, empty }: { messages: MessageWithDeliveries[] | undefined; names: (sessionId: string) => string; empty: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto py-2"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {messages === undefined && <p className="p-6 text-center text-sm text-zinc-600">Loading…</p>}
      {messages?.length === 0 && <p className="p-6 text-center text-sm text-zinc-600">{empty}</p>}
      {messages?.map((m, i) => {
        const prev = messages[i - 1];
        const grouped =
          !!prev && prev.senderKind !== "hub" && m.senderKind !== "hub" && prev.senderLabel === m.senderLabel && m.createdAt - prev.createdAt < GROUP_MS;
        return <MessageItem key={m.id} message={m} grouped={grouped} names={names} />;
      })}
    </div>
  );
}
