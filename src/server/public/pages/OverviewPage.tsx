import React, { useState } from "react";
import { Plus, MessagesSquare } from "lucide-react";
import { Button } from "../components/ui";
import { useHub } from "../lib/store";
import { ChannelCard } from "../components/overview/ChannelCard";
import { NewChannelDialog } from "../components/overview/NewChannelDialog";

interface OverviewPageProps {
  onSelectChannel: (id: string) => void;
}

export function OverviewPage({ onSelectChannel }: OverviewPageProps) {
  const channels = useHub((s) => s.channels);
  const membersByChannel = useHub((s) => s.membersByChannel);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <MessagesSquare size={22} className="text-indigo-400" />
          <h1 className="text-xl font-bold text-zinc-100">Channels</h1>
          <span className="text-sm text-zinc-500">{channels.length}</span>
          <Button className="ml-auto" icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>
            New channel
          </Button>
        </div>

        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-600">
            No channels yet. Create one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                members={membersByChannel[ch.id] ?? []}
                onSelect={() => onSelectChannel(ch.id)}
              />
            ))}
          </div>
        )}
      </div>

      <NewChannelDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
