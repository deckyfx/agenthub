import { useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import type { Result, Thread } from "../../lib/hub-store";
import { hubStore } from "../lib/store";
import { IconButton } from "./ui";

/**
 * Message box. Enter sends, Shift+Enter adds a newline. Sends to `thread`,
 * or through `onSend` when given (e.g. relaying to a subagent).
 */
export function Composer({
  thread,
  onSend,
  placeholder,
  aliases = [],
}: {
  thread?: Thread;
  onSend?: (body: string) => Promise<Result>;
  placeholder: string;
  aliases?: string[];
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = onSend
      ? await onSend(body)
      : thread
        ? await hubStore.getState().send(thread, body)
        : ({ ok: false, error: "Nowhere to send" } as const);
    setSending(false);
    if (!res.ok) return setError(res.error);
    setError("");
    setText("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t border-zinc-800 p-3">
      {aliases.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {aliases.map((a) => (
            <button
              key={a}
              type="button"
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              onClick={() => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${a} `)}
            >
              @{a}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}
      <div className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 focus-within:border-indigo-400">
        <textarea
          rows={Math.min(8, Math.max(1, text.split("\n").length))}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="max-h-60 flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <IconButton onClick={() => void send()} disabled={!text.trim() || sending} aria-label="Send">
          <SendHorizontal className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
