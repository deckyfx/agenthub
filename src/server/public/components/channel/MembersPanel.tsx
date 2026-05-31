import React, { useState } from "react";
import { Users, UserPlus, X } from "lucide-react";
import { cn, senderStyle } from "../ui";
import { useHub, selectMembers } from "../../lib/store";
import { InviteDialog } from "./InviteDialog";
import type { AgentChannel } from "../../../../db/schema";

/**
 * The active channel's member roster, rendered inside the app's left rail.
 * Collapses to avatar-only on the desktop rail (via the `md:` breakpoint) and
 * shows the full list in the mobile drawer / expanded rail.
 */
export function MembersPanel({
  channelId,
  collapsed,
  onShowPrompt,
}: {
  channelId: string;
  /** Desktop rail collapsed state (mobile drawer always shows the full list). */
  collapsed: boolean;
  /** Open a member's join prompt (owned by the shell so mentions can reuse it). */
  onShowPrompt: (member: AgentChannel) => void;
}) {
  const members = useHub(selectMembers(channelId));
  const removeMember = useHub((s) => s.removeMember);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div>
      <div className={cn("flex items-center gap-2 px-2 pb-1", collapsed && "md:justify-center md:px-0")}>
        <Users size={14} className="shrink-0 text-zinc-500" />
        <span className={cn("flex-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600", collapsed && "md:hidden")}>
          Members
        </span>
        <span className={cn("text-[10px] text-zinc-600", collapsed && "md:hidden")}>{members.length}</span>
        <button
          onClick={() => setInviteOpen(true)}
          aria-label="Invite agent"
          title="Invite agent"
          className={cn("rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200", collapsed && "md:hidden")}
        >
          <UserPlus size={14} />
        </button>
      </div>

      {/* Collapsed-rail invite button (icon only) */}
      {collapsed && (
        <button
          onClick={() => setInviteOpen(true)}
          aria-label="Invite agent"
          title="Invite agent"
          className="mx-auto mb-1 hidden rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:block"
        >
          <UserPlus size={15} />
        </button>
      )}

      <div className="space-y-0.5">
        {members.length === 0 ? (
          <p className={cn("px-2 py-1 text-xs text-zinc-600", collapsed && "md:hidden")}>No members yet.</p>
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
                  title={`@${m.alias} — show join prompt`}
                  aria-label={`Show @${m.alias}'s join prompt`}
                  className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left", collapsed && "md:justify-center")}
                >
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", style.avatar)}>
                    {m.alias.charAt(0).toUpperCase()}
                  </div>
                  <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
                    <p className={cn("truncate font-mono text-xs", style.text)}>@{m.alias}</p>
                    {m.role_description && <p className="truncate text-[10px] text-zinc-600">{m.role_description}</p>}
                  </div>
                </button>
                <button
                  onClick={() => removeMember(channelId, m.agent_id)}
                  aria-label={`Remove @${m.alias} from channel`}
                  title="Remove"
                  className={cn(
                    "shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 focus:opacity-100 group-hover:opacity-100",
                    collapsed && "md:hidden",
                  )}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <InviteDialog
        channelId={channelId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
