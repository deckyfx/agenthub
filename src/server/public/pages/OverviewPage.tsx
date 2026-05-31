import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { InjectPanel } from "../components/InjectPanel";
import { FormPanel, Field, SubmitBtn } from "../components/FormPanel";
import type { Agent, AgentGroup, Channel, AgentChannel } from "../../../db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a Unix timestamp (seconds) as a relative human-readable string.
 * e.g. "just now", "2m ago", "3h ago", "5d ago"
 */
function relativeTime(unixSec: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unixSec;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Resolved channel subscription with agent alias. */
interface ChannelMember extends AgentChannel {
  agent?: Agent;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface OverviewPageProps {
  /** Called when the user clicks a channel card to open that channel's view. */
  onSelectChannel: (id: string) => void;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage({ onSelectChannel }: OverviewPageProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelMembers, setChannelMembers] = useState<Record<string, ChannelMember[]>>({});
  const [groupMembers, setGroupMembers] = useState<Record<string, Agent[]>>({});
  const [agentsOpen, setAgentsOpen] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────

  async function fetchAll() {
    const [agentsRes, groupsRes, channelsRes] = await Promise.all([
      api.api.agents.get(),
      api.api.groups.get(),
      api.api.channels.get(),
    ]);

    const fetchedAgents: Agent[] = agentsRes.data?.agents ?? [];
    setAgents(fetchedAgents);

    if (groupsRes.data?.groups) {
      setGroups(groupsRes.data.groups);
      const memberMap: Record<string, Agent[]> = {};
      await Promise.all(
        groupsRes.data.groups.map(async (g) => {
          const res = await api.api.groups({ id: g.id }).members.get();
          memberMap[g.id] = (res.data?.members ?? []) as Agent[];
        }),
      );
      setGroupMembers(memberMap);
    }

    const fetchedChannels: Channel[] = channelsRes.data?.channels ?? [];
    setChannels(fetchedChannels);

    // Fetch members for each channel and cross-reference agent records
    const agentById = Object.fromEntries(fetchedAgents.map((a) => [a.id, a]));
    const chanMemberMap: Record<string, ChannelMember[]> = {};
    await Promise.all(
      fetchedChannels.map(async (ch) => {
        const res = await api.api.channels({ id: ch.id }).members.get();
        const subs = (res.data?.members ?? []) as AgentChannel[];
        chanMemberMap[ch.id] = subs.map((s) => ({
          ...s,
          agent: agentById[s.agent_id],
        }));
      }),
    );
    setChannelMembers(chanMemberMap);
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────

  const groupedIds = new Set(Object.values(groupMembers).flat().map((a) => a.id));
  const ungrouped = agents.filter((a) => !groupedIds.has(a.id));
  const now = Math.floor(Date.now() / 1000);
  const staleCount = agents.filter((a) => now - a.last_heartbeat > 60).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Topics Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Topics</h1>
          <span className="text-xs text-gray-500">
            {channels.length} channel{channels.length !== 1 ? "s" : ""}
          </span>
        </div>
        <NewChannelForm onDone={fetchAll} />
      </div>

      {/* ── Channel Cards Grid ── */}
      {channels.length === 0 ? (
        <div className="text-center py-12 text-gray-600 text-sm">
          No channels yet. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              members={channelMembers[ch.id] ?? []}
              onSelect={() => onSelectChannel(ch.id)}
            />
          ))}
        </div>
      )}

      {/* ── Agents Section (collapsible) ── */}
      <section className="bg-gray-900 rounded-lg overflow-hidden">
        <button
          onClick={() => setAgentsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-sm">Agents</span>
            <span className="text-xs text-gray-500">{agents.length} registered</span>
            {staleCount > 0 && (
              <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">
                ⚠ {staleCount} stale
              </span>
            )}
          </div>
          <span className="text-gray-500 text-xs">{agentsOpen ? "▲ collapse" : "▼ expand"}</span>
        </button>

        {agentsOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-3">
            {/* Grouped agents */}
            {groups.map((group) => {
              const members = groupMembers[group.id] ?? [];
              return (
                <div key={group.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {group.display_name}
                    </h3>
                    <span className="text-xs text-gray-600">{members.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {members.map((a) => (
                      <AgentCard key={a.id} agent={a} stale={now - a.last_heartbeat > 60} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Ungrouped agents */}
            {ungrouped.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Ungrouped
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ungrouped.map((a) => (
                    <AgentCard key={a.id} agent={a} stale={now - a.last_heartbeat > 60} />
                  ))}
                </div>
              </div>
            )}

            {agents.length === 0 && (
              <p className="text-gray-600 text-sm">No agents registered yet.</p>
            )}
          </div>
        )}
      </section>

      {/* ── Global Inject Panel ── */}
      <InjectPanel onInjected={fetchAll} />
    </div>
  );
}

// ─── Channel Card ─────────────────────────────────────────────────────────────

interface ChannelCardProps {
  channel: Channel;
  members: ChannelMember[];
  onSelect: () => void;
}

function ChannelCard({ channel, members, onSelect }: ChannelCardProps) {
  return (
    <button
      onClick={onSelect}
      className="group text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-blue-700 rounded-lg p-4 space-y-3 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
    >
      {/* Card header: ID + member count */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm text-blue-400 group-hover:text-blue-300 truncate">
          {channel.id}
        </span>
        <span className="flex-shrink-0 text-xs text-gray-500 bg-gray-800 group-hover:bg-gray-700 px-2 py-0.5 rounded-full">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Topic */}
      <p className="text-sm text-gray-200 leading-snug line-clamp-2">
        {channel.topic}
      </p>

      {/* Footer: time + agent aliases */}
      <div className="space-y-2">
        <p className="text-xs text-gray-600">
          {relativeTime(channel.created_at)}
        </p>

        {members.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {members.map((m) => (
              <span
                key={m.agent_id}
                className="text-xs font-mono text-gray-400 bg-gray-800 group-hover:bg-gray-700 px-1.5 py-0.5 rounded"
              >
                @{m.alias}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── New Channel Form ─────────────────────────────────────────────────────────

function NewChannelForm({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState("");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <FormPanel label="New Channel">
      {(close) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!id.trim() || !topic.trim()) return;
            setLoading(true);

            // Create the channel
            await api.api.channels.post({
              id: id.trim(),
              topic: topic.trim(),
              created_by: "moderator",
            });

            // Inject background context if provided
            if (context.trim()) {
              await api.api.context.post({
                channel_id: id.trim(),
                target_agent: "all",
                content: context.trim(),
                priority: "normal",
              });
            }

            setId("");
            setTopic("");
            setContext("");
            setLoading(false);
            onDone();
            close();
          }}
          className="space-y-2"
        >
          <Field label="Channel ID" value={id} onChange={setId} placeholder="ch-auth" mono />
          <Field label="Topic" value={topic} onChange={setTopic} placeholder="Implement authentication feature" />
          <div>
            <p className="text-xs text-gray-500 mb-1">Background context (optional)</p>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Any initial notes, goals, or constraints agents should know..."
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <SubmitBtn label="Create Channel" loading={loading} />
        </form>
      )}
    </FormPanel>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, stale }: { agent: Agent; stale: boolean }) {
  return (
    <div className={`bg-gray-800 rounded-lg p-3 border ${stale ? "border-red-700" : "border-gray-700"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-sm text-white truncate">{agent.id}</span>
        <StatusBadge status={agent.status} />
      </div>
      <p className="text-xs text-gray-400 truncate">{agent.display_name}</p>
      <p className="text-xs text-gray-600 truncate mt-0.5 font-mono">{agent.working_dir}</p>
      {stale && <p className="text-xs text-red-400 mt-1">⚠ Stale heartbeat</p>}
    </div>
  );
}
