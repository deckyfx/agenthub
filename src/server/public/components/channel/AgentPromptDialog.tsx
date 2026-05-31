import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Dialog } from "../ui";
import { useHub } from "../../lib/store";
import { PromptView } from "./PromptView";
import { PromptTldr } from "./PromptTldr";

interface Props {
  channelId: string;
  /** The member to show the prompt for, or null when the dialog is closed. */
  member: { agent_id: string; alias: string } | null;
  onClose: () => void;
}

/**
 * Re-displays an existing member's join prompt, reconstructed from persisted
 * state. Useful when an agent's CLI was killed or removed: the moderator can
 * copy this and hand it to a replacement agent to resume the same alias/role.
 *
 * The prompt is fetched on open (a user-initiated, on-demand load — distinct
 * from the store's background poll), with explicit loading/error states.
 */
export function AgentPromptDialog({ channelId, member, onClose }: Props) {
  const getAgentPrompt = useHub((s) => s.getAgentPrompt);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agentId = member?.agent_id;

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setPrompt(null);
    setError(null);
    getAgentPrompt(channelId, agentId)
      .then((p) => !cancelled && setPrompt(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [channelId, agentId, getAgentPrompt]);

  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      title={member ? `@${member.alias} — join prompt` : ""}
      icon={<FileText size={16} />}
      widthClass="max-w-3xl"
    >
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-zinc-500">
          Re-deliver this to a replacement agent so it assumes{" "}
          <span className="font-mono text-indigo-400">@{member?.alias}</span>'s role and continues
          where the previous session left off.
        </p>
        {error !== null ? (
          <p className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-400">
            {error}
          </p>
        ) : prompt === null ? (
          <p className="py-8 text-center text-xs text-zinc-600">Loading prompt…</p>
        ) : (
          <>
            {member && <PromptTldr channelId={channelId} alias={member.alias} />}
            <PromptView prompt={prompt} rows={22} />
          </>
        )}
      </div>
    </Dialog>
  );
}
