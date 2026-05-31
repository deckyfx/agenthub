import React, { useState } from "react";
import { Users, UserPlus, X } from "lucide-react";
import { Button, cn, senderStyle } from "../ui";
import { useHub, selectMembers } from "../../lib/store";
import { InviteDialog } from "./InviteDialog";

/** Left panel: the channel's member roster with avatars and an Invite action. */
export function MembersPanel({ channelId, channelTopic }: { channelId: string; channelTopic: string }) {
  const members = useHub(selectMembers(channelId));
  const removeMember = useHub((s) => s.removeMember);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <Users size={15} className="text-zinc-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Members</span>
        <span className="text-xs text-zinc-600">{members.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {members.length === 0 ? (
          <p className="px-1 py-2 text-xs text-zinc-600">No members yet. Invite an agent.</p>
        ) : (
          members.map((m) => {
            const style = senderStyle(m.alias);
            return (
              <div
                key={m.agent_id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-800/60"
              >
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", style.avatar)}>
                  {m.alias.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-mono text-sm", style.text)}>@{m.alias}</p>
                  {m.role_description && <p className="truncate text-xs text-zinc-600">{m.role_description}</p>}
                </div>
                <button
                  onClick={() => removeMember(channelId, m.agent_id)}
                  className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-zinc-800 p-2">
        <Button full icon={<UserPlus size={15} />} onClick={() => setInviteOpen(true)}>
          Invite
        </Button>
      </div>

      <InviteDialog
        channelId={channelId}
        channelTopic={channelTopic}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </aside>
  );
}
