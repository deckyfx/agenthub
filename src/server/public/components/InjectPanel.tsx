import React, { useState } from "react";
import { api } from "../lib/api";

interface Props {
  channelId?: string;
  onInjected?: () => void;
}

/** Moderator context injection panel */
export function InjectPanel({ channelId, onInjected }: Props) {
  const [content, setContent] = useState("");
  const [target, setTarget] = useState("all");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);

    await api.api.context.post({
      channel_id: channelId ?? undefined,
      target_agent: target.trim() || "all",
      content: content.trim(),
      priority,
    });

    setContent("");
    setSent(true);
    setLoading(false);
    setTimeout(() => setSent(false), 2000);
    onInjected?.();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Inject Context
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="agentId, @alias, group:id, all"
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="normal">Normal</option>
          <option value="urgent">🚨 Urgent</option>
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Context or command to inject..."
        rows={3}
        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
      />
      <button
        type="submit"
        disabled={loading || !content.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-1.5 rounded text-sm transition-colors"
      >
        {sent ? "✓ Injected" : loading ? "Sending…" : "Inject"}
      </button>
    </form>
  );
}
