import React from "react";
import { Hash, Users } from "lucide-react";
import { cn, senderStyle } from "../ui";
import type { Channel, AgentChannel } from "../../../../db/schema";

/** Format a Unix timestamp (seconds) as a short relative string. */
function relativeTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** A clickable channel summary card with topic and stacked member avatars. */
export function ChannelCard({
  channel, members, onSelect,
}: {
  channel: Channel;
  members: AgentChannel[];
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition-all hover:border-indigo-600/60 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/50"
    >
      <div className="flex items-center gap-2">
        <Hash size={16} className="text-indigo-400" />
        <span className="truncate font-mono text-sm font-medium text-zinc-100">{channel.id}</span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          <Users size={12} /> {members.length}
        </span>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-snug text-zinc-300">{channel.topic}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {members.slice(0, 6).map((m) => {
            const style = senderStyle(m.alias);
            return (
              <div
                key={m.agent_id}
                title={`@${m.alias}`}
                className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-zinc-900", style.avatar)}
              >
                {m.alias.charAt(0).toUpperCase()}
              </div>
            );
          })}
          {members.length > 6 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold text-zinc-300 ring-2 ring-zinc-900">
              +{members.length - 6}
            </div>
          )}
        </div>
        <span className="text-xs text-zinc-600">{relativeTime(channel.created_at)}</span>
      </div>
    </button>
  );
}
