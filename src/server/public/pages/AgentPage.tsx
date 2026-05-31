import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import type { Agent, AgentChannel } from "../../../db/schema";
import type { AgentStatus } from "../../../stores/agent-store";

interface Props {
  agentId: string;
  onBack: () => void;
}

export function AgentPage({ agentId, onBack }: Props) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [subscriptions, setSubscriptions] = useState<Array<AgentChannel & { channelId: string }>>([]);

  async function fetchData() {
    const [agentRes, channelsRes] = await Promise.all([
      api.api.agents({ id: agentId }).get(),
      api.api.channels.get(),
    ]);

    if (agentRes.data?.agent) setAgent(agentRes.data.agent);

    if (channelsRes.data?.channels) {
      const subs: Array<AgentChannel & { channelId: string }> = [];
      await Promise.all(
        channelsRes.data.channels.map(async (ch) => {
          const res = await api.api.channels({ id: ch.id }).members.get();
          const mine = (res.data?.members ?? []).find((m: AgentChannel) => m.agent_id === agentId);
          if (mine) subs.push({ ...mine, channelId: ch.id });
        }),
      );
      setSubscriptions(subs);
    }
  }

  async function overrideStatus(status: AgentStatus) {
    await api.api.agents({ id: agentId }).status.patch({ status });
    fetchData();
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [agentId]);

  if (!agent) {
    return (
      <div>
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm mb-4 block">← Back</button>
        <p className="text-gray-500 text-sm">Loading {agentId}…</p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const stale = now - agent.last_heartbeat > 60;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="font-bold text-white text-lg font-mono">{agent.id}</h1>
        <StatusBadge status={agent.status} />
        {stale && <span className="text-xs text-red-400">⚠ Stale</span>}
      </div>

      <div className="bg-gray-900 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-xs text-gray-500 mb-1">Display Name</p><p className="text-gray-200">{agent.display_name}</p></div>
        <div><p className="text-xs text-gray-500 mb-1">Working Dir</p><p className="text-gray-200 font-mono text-xs">{agent.working_dir}</p></div>
        <div><p className="text-xs text-gray-500 mb-1">Last Heartbeat</p><p className="text-gray-200">{new Date(agent.last_heartbeat * 1000).toLocaleString()}</p></div>
        <div><p className="text-xs text-gray-500 mb-1">Registered</p><p className="text-gray-200">{new Date(agent.created_at * 1000).toLocaleString()}</p></div>
      </div>

      <div className="bg-gray-900 rounded-lg p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Override Status</p>
        <div className="flex flex-wrap gap-2">
          {(["idle","working","waiting","blocked","done"] as AgentStatus[]).map((s) => (
            <button
              key={s}
              disabled={agent.status === s}
              onClick={() => overrideStatus(s)}
              className="px-3 py-1 rounded text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg p-4">
        <h2 className="font-semibold text-white mb-3">Channel Subscriptions</h2>
        {subscriptions.length === 0 ? (
          <p className="text-gray-500 text-sm">Not subscribed to any channels.</p>
        ) : (
          <div className="space-y-1">
            {subscriptions.map((sub) => (
              <div key={sub.channelId} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-blue-400">{sub.channelId}</span>
                <span className="text-blue-300">@{sub.alias}</span>
                {sub.role_description && <span className="text-gray-500 text-xs">{sub.role_description}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
