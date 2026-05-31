import React, { useState } from "react";
import { Zap, Copy, Check } from "lucide-react";

/**
 * TLDR quick-start: instead of pasting the full prompt, hand the agent a single
 * line. Agents already have the `agenthub` binary, so they can fetch and follow
 * their own briefing directly — no curl, no copy of the wall of text.
 */
export function PromptTldr({ channelId, alias }: { channelId: string; alias: string }) {
  const [copied, setCopied] = useState(false);
  const command = `agenthub prompt --channel ${channelId} --alias ${alias}`;
  const oneLiner = `Execute and follow the instructions printed by: ${command}`;

  async function copy() {
    await navigator.clipboard.writeText(oneLiner);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-300">
        <Zap size={13} /> TLDR — one-liner
      </div>
      <p className="mb-2 text-xs leading-relaxed text-zinc-500">
        Paste this into a fresh agent session; it pulls the full prompt below from the hub itself.
      </p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 select-all overflow-x-auto whitespace-nowrap rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 font-mono text-xs text-zinc-300">
          {oneLiner}
        </code>
        <button
          onClick={copy}
          title="Copy one-liner"
          aria-label="Copy one-liner"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
