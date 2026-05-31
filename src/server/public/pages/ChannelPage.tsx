import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Hash, Archive } from "lucide-react";
import { IconButton, cn } from "../components/ui";
import { useHub, selectMessages } from "../lib/store";
import { MembersPanel } from "../components/channel/MembersPanel";
import { ContextPanel } from "../components/channel/ContextPanel";
import { Composer } from "../components/channel/Composer";
import { MessageBubble } from "../components/channel/MessageBubble";

interface Props {
  channelId: string;
  onBack: () => void;
}

export function ChannelPage({ channelId, onBack }: Props) {
  const channel = useHub((s) => s.channels.find((c) => c.id === channelId) ?? null);
  const messages = useHub(selectMessages(channelId));
  const archiveChannel = useHub((s) => s.archiveChannel);

  const [filter, setFilter] = useState("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to newest on count change — a genuine DOM side-effect.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const displayed = filter === "all" ? messages : messages.filter((m) => m.type === filter);
  const types = [...new Set(messages.map((m) => m.type))];

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <header className="mb-4 flex shrink-0 items-center gap-3">
        <IconButton onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </IconButton>
        <Hash size={18} className="text-indigo-400" />
        <h1 className="font-mono text-lg font-semibold text-zinc-100">{channelId}</h1>
        {channel?.topic && <span className="truncate text-sm text-zinc-500">{channel.topic}</span>}
        <button
          onClick={() => {
            if (confirm(`Archive channel ${channelId}?`)) {
              archiveChannel(channelId);
              onBack();
            }
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-rose-600/10 hover:text-rose-400"
        >
          <Archive size={14} /> Archive
        </button>
      </header>

      {/* ── Body: left members · center feed · right context ── */}
      <div className="flex min-h-0 flex-1 gap-4">
        <MembersPanel channelId={channelId} channelTopic={channel?.topic ?? ""} />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
          {/* Filter chips */}
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-zinc-800 px-3 py-2.5">
            {["all", ...types].map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
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
              displayed.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={bottomRef} />
          </div>

          <Composer channelId={channelId} />
        </section>

        <ContextPanel channelId={channelId} />
      </div>
    </div>
  );
}
