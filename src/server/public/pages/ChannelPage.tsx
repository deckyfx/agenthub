import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Hash, Archive, BookOpen } from "lucide-react";
import { IconButton, cn } from "../components/ui";
import { useHub, selectMessages, selectMembers } from "../lib/store";
import { ContextDialog } from "../components/channel/ContextDialog";
import { Composer } from "../components/channel/Composer";
import { MessageBubble } from "../components/channel/MessageBubble";
import type { AgentChannel } from "../../../db/schema";

interface Props {
  channelId: string;
  onBack: () => void;
  /** Open a member's join prompt (shared dialog owned by the app shell). */
  onShowPrompt: (member: AgentChannel) => void;
}

export function ChannelPage({ channelId, onBack, onShowPrompt }: Props) {
  const channel = useHub((s) => s.channels.find((c) => c.id === channelId) ?? null);
  const messages = useHub(selectMessages(channelId));
  const members = useHub(selectMembers(channelId));
  const contexts = useHub((s) => s.contexts);
  const archiveChannel = useHub((s) => s.archiveChannel);

  const [filter, setFilter] = useState("all");
  const [contextOpen, setContextOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastChannel = useRef<string | null>(null);

  const contextCount = contexts.filter((c) => c.channel_id === channelId).length;

  /** Resolve an @mention alias to a member and open its join prompt. */
  function showPromptForAlias(alias: string) {
    const member = members.find((m) => m.alias === alias);
    if (member) onShowPrompt(member);
  }

  // Keep the feed pinned to the latest message. On *entering* a channel jump
  // instantly (no animation); only smooth-scroll for new messages that arrive
  // while you're already looking at it.
  useEffect(() => {
    const entering = lastChannel.current !== channelId;
    lastChannel.current = channelId;
    bottomRef.current?.scrollIntoView({ behavior: entering ? "auto" : "smooth" });
  }, [channelId, messages.length]);

  const displayed = filter === "all" ? messages : messages.filter((m) => m.type === filter);
  const types = [...new Set(messages.map((m) => m.type))];

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <header className="mb-3 flex shrink-0 items-center gap-2 sm:mb-4 sm:gap-3">
        <IconButton onClick={onBack} aria-label="Back to overview">
          <ArrowLeft size={18} />
        </IconButton>
        <Hash size={18} className="shrink-0 text-indigo-400" />
        <h1 className="shrink-0 font-mono text-base font-semibold text-zinc-100 sm:text-lg">{channelId}</h1>
        {channel?.topic && <span className="hidden min-w-0 truncate text-sm text-zinc-500 sm:inline">{channel.topic}</span>}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            onClick={() => setContextOpen(true)}
            aria-label="Background and context"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <BookOpen size={15} />
            <span className="hidden sm:inline">Context</span>
            {contextCount > 0 && (
              <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">{contextCount}</span>
            )}
          </button>
          <button
            onClick={() => {
              if (confirm(`Archive channel ${channelId}?`)) {
                archiveChannel(channelId);
                onBack();
              }
            }}
            aria-label={`Archive channel ${channelId}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-rose-600/10 hover:text-rose-400"
          >
            <Archive size={14} /> <span className="hidden sm:inline">Archive</span>
          </button>
        </div>
      </header>

      {/* ── Feed (full width; members live in the rail, context in a dialog) ── */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
        {/* Filter chips */}
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-zinc-800 px-3 py-2.5" role="group" aria-label="Filter messages by type">
          {["all", ...types].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              aria-pressed={filter === t}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                filter === t
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {displayed.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-600">No messages yet.</p>
          ) : (
            displayed.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} onMentionClick={showPromptForAlias} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <Composer channelId={channelId} />
      </section>

      <ContextDialog channelId={channelId} open={contextOpen} onClose={() => setContextOpen(false)} />
    </div>
  );
}
