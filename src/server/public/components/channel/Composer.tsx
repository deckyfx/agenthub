import React, { useMemo, useRef, useState } from "react";
import { AtSign, Users, Send, CornerDownLeft } from "lucide-react";
import { Button } from "../ui";
import { useHub, selectMembers } from "../../lib/store";

/** Shared typography/box metrics so the overlay and textarea align exactly. */
const TEXT_CLS =
  "block max-h-40 min-h-[80px] rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm leading-relaxed font-sans";

/**
 * Always-expanded message composer.
 *
 * - Enter sends · Shift+Enter inserts a newline.
 * - Typing `@` opens a member/group autocomplete; Enter accepts the first match.
 * - Valid @mentions (a real member or group) are highlighted live via an overlay
 *   rendered behind a transparent textarea, kept aligned by sharing metrics.
 */
export function Composer({ channelId }: { channelId: string }) {
  const members = useHub(selectMembers(channelId));
  const groups = useHub((s) => s.groups);
  const sendMessage = useHub((s) => s.sendMessage);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const validAlias = useMemo(() => new Set(members.map((m) => m.alias)), [members]);
  const validGroup = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);

  async function send() {
    if (!text.trim()) return;
    setLoading(true);
    await sendMessage(channelId, text.trim());
    setText("");
    setMentionQuery(null);
    setLoading(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const match = val.slice(0, cursor).match(/@([\w-]*(?::[\w-]*)?)$/);
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  function insertMention(token: string) {
    const ta = taRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const before = text.slice(0, cursor).replace(/@([\w-]*(?::[\w-]*)?)$/, `@${token} `);
    const next = before + text.slice(cursor);
    setText(next);
    setMentionQuery(null);
    setTimeout(() => {
      ta?.focus();
      ta?.setSelectionRange(before.length, before.length);
    }, 0);
  }

  const q = (mentionQuery ?? "").toLowerCase();
  const memberSuggestions = members.filter((m) => m.alias.toLowerCase().startsWith(q));
  const groupSuggestions = groups.filter(
    (g) => g.id.toLowerCase().startsWith(q) || `group:${g.id}`.toLowerCase().startsWith(q.replace(/^group:/, "")),
  );
  const showDropdown = mentionQuery !== null && (memberSuggestions.length > 0 || groupSuggestions.length > 0);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setMentionQuery(null); return; }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showDropdown) {
        const first = memberSuggestions[0]?.alias ?? (groupSuggestions[0] ? `group:${groupSuggestions[0].id}` : null);
        if (first) { insertMention(first); return; }
      }
      send();
    }
  }

  return (
    <div className="shrink-0 border-t border-zinc-800 p-3">
      <div className="relative">
        {showDropdown && (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-44 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
            {memberSuggestions.map((m) => (
              <button
                key={m.agent_id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.alias); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-700"
              >
                <AtSign size={13} className="text-indigo-400" />
                <span className="font-mono text-indigo-300">{m.alias}</span>
                {m.role_description && <span className="ml-auto truncate text-xs text-zinc-500">{m.role_description}</span>}
              </button>
            ))}
            {groupSuggestions.map((g) => (
              <button
                key={g.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(`group:${g.id}`); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-700"
              >
                <Users size={13} className="text-violet-400" />
                <span className="font-mono text-violet-300">group:{g.id}</span>
              </button>
            ))}
          </div>
        )}

        {/* Highlight overlay + transparent textarea, kept perfectly aligned */}
        <div className="relative">
          <div
            ref={backdropRef}
            aria-hidden
            className={TEXT_CLS + " pointer-events-none absolute inset-0 overflow-y-auto whitespace-pre-wrap break-words text-zinc-100"}
          >
            {renderHighlighted(text, validAlias, validGroup)}
            {" "}
          </div>
          <textarea
            ref={taRef}
            value={text}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            placeholder="Message the channel…  @alias to target · /type to set kind · Enter to send"
            className={TEXT_CLS + " relative w-full resize-none bg-transparent text-transparent caret-zinc-100 placeholder-zinc-600 focus:outline-none"}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <p className="flex items-center gap-1 text-xs text-zinc-600">
          <CornerDownLeft size={12} /> send · <span className="font-medium text-zinc-500">Shift</span>+
          <CornerDownLeft size={12} /> newline
        </p>
        <Button className="ml-auto" icon={<Send size={15} />} disabled={loading || !text.trim()} onClick={send}>
          {loading ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

/** Render text with valid @mentions wrapped in a colored span. */
function renderHighlighted(text: string, validAlias: Set<string>, validGroup: Set<string>): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /@([\w-]+(?::[\w-]+)?)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const token = m[1] ?? "";
    const valid = token.startsWith("group:") ? validGroup.has(token.slice(6)) : validAlias.has(token);
    nodes.push(
      <span key={key++} className={valid ? "rounded bg-indigo-500/20 font-medium text-indigo-300" : "text-zinc-400"}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
  return nodes;
}
