import React, { useState } from "react";
import { Users, UserPlus, X, FileText } from "lucide-react";
import { Button, cn, senderStyle } from "../ui";
import { useHub, selectMembers } from "../../lib/store";
import { InviteDialog } from "./InviteDialog";
import type { AgentChannel } from "../../../../db/schema";

/** Left panel: the channel's member roster with avatars and an Invite action. */
export function MembersPanel({
  channelId,
  onShowPrompt,
}: {
  channelId: string;
  /** Open a member's join prompt (owned by the parent so mentions can reuse it). */
  onShowPrompt: (member: AgentChannel) => void;
}) {
  const members = useHub(selectMembers(channelId));
  const removeMember = useHub((s) => s.removeMember);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <aside aria-label="Channel members" className="flex max-h-44 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 lg:max-h-none lg:w-60">
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
                className="group flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-zinc-800/60"
              >
                <button
                  onClick={() => onShowPrompt(m)}
                  title="Show join prompt"
                  aria-label={`Show @${m.alias}'s join prompt`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left"
                >
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", style.avatar)}>
                    {m.alias.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-mono text-sm", style.text)}>@{m.alias}</p>
                    {m.role_description && <p className="truncate text-xs text-zinc-600">{m.role_description}</p>}
                  </div>
                  <FileText size={13} className="shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </button>
                <button
                  onClick={() => removeMember(channelId, m.agent_id)}
                  aria-label={`Remove @${m.alias} from channel`}
                  title="Remove"
                  className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
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
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </aside>
  );
}
