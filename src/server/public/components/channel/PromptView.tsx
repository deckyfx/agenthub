import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "../ui";

/**
 * Read-only, copy-able view of a generated agent prompt.
 *
 * Shared by the invite flow (showing a freshly generated prompt) and the
 * re-display flow (re-showing an existing member's join prompt), so the
 * presentation stays identical in both places.
 */
export function PromptView({ prompt, rows = 14 }: { prompt: string; rows?: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <textarea
        readOnly
        value={prompt}
        rows={rows}
        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        className="w-full select-all resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-indigo-600 focus:outline-none"
      />
      <Button full icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copy}>
        {copied ? "Copied!" : "Copy prompt"}
      </Button>
    </div>
  );
}
