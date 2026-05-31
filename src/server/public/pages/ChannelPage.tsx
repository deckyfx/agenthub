import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { FormPanel, Field, SubmitBtn } from "../components/FormPanel";
import { GeneratePromptPanel } from "../components/GeneratePromptPanel";
import type { Message, AgentChannel, Channel, ContextInjection } from "../../../db/schema";

const TYPE_COLORS: Record<string, string> = {
  task:    "text-blue-400",
  result:  "text-green-400",
  question:"text-yellow-400",
  answer:  "text-yellow-300",
  command: "text-purple-400",
  context: "text-cyan-400",
  status:  "text-gray-400",
};

interface Props {
  channelId: string;
  onBack: () => void;
}

export function ChannelPage({ channelId, onBack }: Props) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<AgentChannel[]>([]);
  const [contexts, setContexts] = useState<ContextInjection[]>([]);
  const [filter, setFilter] = useState("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function fetchData() {
    const [msgsRes, membersRes, channelsRes, ctxRes] = await Promise.all([
      api.api.channels({ id: channelId }).messages.get(),
      api.api.channels({ id: channelId }).members.get(),
      api.api.channels.get(),
      api.api.context.get(),
    ]);
    if (msgsRes.data?.messages) setMessages(msgsRes.data.messages);
    if (membersRes.data?.members) setMembers(membersRes.data.members);
    if (channelsRes.data?.channels) {
      const found = (channelsRes.data.channels as Channel[]).find((c) => c.id === channelId);
      if (found) setChannel(found);
    }
    // Filter context injections client-side by this channel
    if (ctxRes.data?.context) {
      setContexts(
        (ctxRes.data.context as ContextInjection[]).filter(
          (c) => c.channel_id === channelId,
        ),
      );
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const displayed = filter === "all" ? messages : messages.filter((m) => m.type === filter);
  const types = [...new Set(messages.map((m) => m.type))];

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <h1 className="font-bold text-white text-lg font-mono">{channelId}</h1>
        {channel?.topic && (
          <span className="text-gray-400 text-sm truncate">{channel.topic}</span>
        )}
        <button
          onClick={async () => {
            if (confirm(`Archive channel ${channelId}?`)) {
              await api.api.channels({ id: channelId }).archive.patch({});
              onBack();
            }
          }}
          className="ml-auto text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          Archive
        </button>
      </div>

      {/* ── Body: left main + right sidebar ── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── LEFT MAIN COLUMN ── */}
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">

          {/* ── Background & Context section ── */}
          <div className="bg-gray-900 rounded-lg p-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Background & Context
              </p>
              <span className="text-xs text-gray-600">{contexts.length} item{contexts.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Context items list */}
            {contexts.length === 0 ? (
              <p className="text-gray-600 text-xs mb-3">No context injected yet.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {contexts.map((ctx) => (
                  <ContextItem key={ctx.id} ctx={ctx} />
                ))}
              </div>
            )}

            {/* Add Context form */}
            <AddContextForm channelId={channelId} members={members} onAdded={fetchData} />
          </div>

          {/* ── Message Feed ── */}
          <div className="flex-1 flex flex-col bg-gray-900 rounded-lg overflow-hidden min-h-0">
            {/* Filter bar */}
            <div className="flex gap-2 p-3 border-b border-gray-800 flex-wrap shrink-0">
              {["all", ...types].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`text-xs px-2 py-1 rounded ${
                    filter === t
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {displayed.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No messages yet.</p>
              ) : (
                displayed.map((msg) => <MessageRow key={msg.id} msg={msg} />)
              )}
              <div ref={bottomRef} />
            </div>

            {/* Send Message form */}
            <div className="border-t border-gray-800 p-3 shrink-0">
              <SendMessageForm channelId={channelId} members={members} onSent={fetchData} />
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="w-64 flex flex-col gap-4 shrink-0 overflow-y-auto">
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Members
                <span className="ml-1 text-gray-600">({members.length})</span>
              </p>
              <SubscribeAgentForm channelId={channelId} onDone={fetchData} />
            </div>
            {members.length === 0 ? (
              <p className="text-gray-600 text-xs">No subscribers yet.</p>
            ) : (
              members.map((m) => (
                <div key={m.agent_id} className="text-sm py-1.5 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-mono">@{m.alias}</span>
                    <button
                      onClick={async () => {
                        await api.api
                          .channels({ id: channelId })
                          .members({ agentId: m.agent_id })
                          .delete();
                        fetchData();
                      }}
                      className="ml-auto text-xs text-gray-600 hover:text-red-400"
                      title="Unsubscribe"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">{m.agent_id}</p>
                  {m.role_description && (
                    <p className="text-xs text-gray-600">{m.role_description}</p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* ── Generate Agent Prompt ── */}
          <GeneratePromptPanel
            channelId={channelId}
            channelTopic={channel?.topic ?? ""}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Context item row ─────────────────────────────────────────────────────────

function ContextItem({ ctx }: { ctx: ContextInjection }) {
  const [expanded, setExpanded] = useState(false);
  const ts = new Date(ctx.created_at * 1000).toLocaleString();

  return (
    <div className="bg-gray-800 rounded p-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-semibold uppercase ${
            ctx.priority === "urgent"
              ? "bg-red-900 text-red-300"
              : "bg-gray-700 text-gray-400"
          }`}
        >
          {ctx.priority}
        </span>
        {ctx.target_agent && ctx.target_agent !== "all" && (
          <span className="text-blue-400 font-mono">→ {ctx.target_agent}</span>
        )}
        <span className="ml-auto text-gray-600">{ts}</span>
      </div>
      <button onClick={() => setExpanded(!expanded)} className="text-left w-full">
        {expanded ? (
          <pre className="whitespace-pre-wrap text-gray-300">{ctx.content}</pre>
        ) : (
          <span className="text-gray-400 truncate block">
            {ctx.content.slice(0, 100)}
            {ctx.content.length > 100 ? "…" : ""}
          </span>
        )}
      </button>
    </div>
  );
}

// ─── Add Context form ─────────────────────────────────────────────────────────

function AddContextForm({
  channelId,
  members,
  onAdded,
}: {
  channelId: string;
  members: AgentChannel[];
  onAdded: () => void;
}) {
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [target, setTarget] = useState("all");
  const [loading, setLoading] = useState(false);

  return (
    <FormPanel label="Add Context">
      {(close) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!content.trim()) return;
            setLoading(true);
            await api.api.context.post({
              channel_id: channelId,
              content: content.trim(),
              priority,
              target_agent: target.trim() || "all",
            });
            setContent("");
            setPriority("normal");
            setTarget("all");
            setLoading(false);
            onAdded();
            close();
          }}
          className="space-y-2"
        >
          <div>
            <p className="text-xs text-gray-500 mb-1">Content</p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Background information, constraints, or instructions..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">Priority</p>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">Target</p>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All members</option>
                {members.map((m) => (
                  <option key={m.agent_id} value={m.alias}>
                    @{m.alias}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <SubmitBtn label="Add Context" loading={loading} />
        </form>
      )}
    </FormPanel>
  );
}

// ─── Subscribe agent form ─────────────────────────────────────────────────────

function SubscribeAgentForm({ channelId, onDone }: { channelId: string; onDone: () => void }) {
  const [agentId, setAgentId] = useState("");
  const [alias, setAlias] = useState("");
  const [role, setRole] = useState("");
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <FormPanel label="Invite">
      {(close) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!agentId.trim() || !alias.trim()) return;
            setLoading(true);
            await api.api.channels({ id: channelId }).members.post({
              agent_id: agentId.trim(),
              alias: alias.trim(),
              role_description: role.trim() || undefined,
              group_id: group.trim() || undefined,
            });
            setAgentId(""); setAlias(""); setRole(""); setGroup("");
            setLoading(false);
            onDone();
            close();
          }}
          className="space-y-2"
        >
          <Field label="Agent ID" value={agentId} onChange={setAgentId} placeholder="crm-backend" mono />
          <Field label="Alias (without @)" value={alias} onChange={setAlias} placeholder="bon" mono />
          <Field label="Role (optional)" value={role} onChange={setRole} placeholder="Backend API agent" />
          <Field label="Group (optional — auto-created)" value={group} onChange={setGroup} placeholder="crm" mono />
          <SubmitBtn label="Invite to Channel" loading={loading} />
        </form>
      )}
    </FormPanel>
  );
}

// ─── Send message form ────────────────────────────────────────────────────────

/**
 * Send a message with Discord-style @mention routing.
 *
 * - @alias       → resolves alias to agent_id, sends direct message
 * - @alias @bob  → fan-out: one message per mentioned agent
 * - @group:crm   → fan-out to all agents in group crm
 * - (no mention) → broadcast to all agents in the channel
 *
 * Autocomplete: type @ to see a dropdown of channel members.
 */
function SendMessageForm({
  channelId,
  members,
  onSent,
}: {
  channelId: string;
  members: AgentChannel[];
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState("question");
  const [loading, setLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [groups, setGroups] = useState<Array<{ id: string; display_name: string }>>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Fetch groups for @group: resolution
  useEffect(() => {
    api.api.groups.get().then((r) => {
      if (r.data?.groups) setGroups(r.data.groups);
    });
  }, []);

  // alias → agent_id map from current channel members
  const aliasMap = Object.fromEntries(members.map((m) => [m.alias, m.agent_id]));

  /** Extract @alias mentions from text (not @group: prefixed ones) */
  function extractMentions(t: string): string[] {
    const raw = [...t.matchAll(/@([\w-]+)/g)].map((m) => m[1] ?? "");
    return [...new Set(raw)];
  }

  /** Resolve a single mention string to { to_agent, to_alias } */
  function resolveMention(mention: string): { to_agent: string; to_alias: string } | null {
    // @group:crm syntax
    if (mention.startsWith("group:")) {
      const groupId = mention.slice(6);
      return { to_agent: `group:${groupId}`, to_alias: `@group:${groupId}` };
    }
    const agentId = aliasMap[mention];
    if (!agentId) return null;
    return { to_agent: agentId, to_alias: mention };
  }

  /** Fan-out one message per resolved target, or broadcast if none */
  async function sendMessages(payload: string) {
    const mentions = extractMentions(payload);
    const resolved = mentions.map(resolveMention).filter(Boolean) as Array<{
      to_agent: string;
      to_alias: string;
    }>;

    if (resolved.length === 0) {
      // Broadcast
      await api.api.messages.post({
        channel_id: channelId,
        from_agent: "moderator",
        to_alias: "all",
        type,
        payload,
      });
      return;
    }

    // Fan-out to each group or agent mentioned
    for (const { to_agent, to_alias } of resolved) {
      if (to_agent.startsWith("group:")) {
        // Expand group → individual messages
        const groupId = to_agent.slice(6);
        const res = await api.api.groups({ id: groupId }).members.get();
        const groupMembers = (res.data?.members ?? []) as Array<{ id: string }>;
        for (const member of groupMembers) {
          await api.api.messages.post({
            channel_id: channelId,
            from_agent: "moderator",
            to_agent: member.id,
            to_alias,
            type,
            payload,
          });
        }
      } else {
        await api.api.messages.post({
          channel_id: channelId,
          from_agent: "moderator",
          to_agent,
          to_alias,
          type,
          payload,
        });
      }
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);

    // Detect @word at cursor
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w-]*)$/);
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  function insertMention(alias: string) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    // Replace the partial @word with the full @alias
    const replaced = before.replace(/@([\w-]*)$/, `@${alias} `);
    const newText = replaced + text.slice(cursor);
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(replaced.length, replaced.length);
    }, 0);
  }

  // Suggestions: channel members + groups (filtered by query)
  const q = (mentionQuery ?? "").toLowerCase();
  const memberSuggestions = members.filter((m) =>
    m.alias.toLowerCase().startsWith(q),
  );
  const groupSuggestions = groups.filter((g) =>
    `group:${g.id}`.toLowerCase().startsWith(q) || g.id.toLowerCase().startsWith(q),
  );
  const showDropdown = mentionQuery !== null && (memberSuggestions.length > 0 || groupSuggestions.length > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FormPanel label="Send Message">
      {(close) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setLoading(true);
            await sendMessages(text.trim());
            setText("");
            setLoading(false);
            onSent();
            close();
          }}
          className="space-y-2"
        >
          {/* Type selector row */}
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 shrink-0">Type</p>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
            >
              {["question", "command", "context", "answer", "result", "status"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <p className="text-xs text-gray-600 ml-1">
              Use @alias to target · @group:id for groups · no mention = broadcast
            </p>
          </div>

          {/* Textarea with @mention autocomplete */}
          <div className="relative">
            <textarea
              ref={taRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMentionQuery(null);
              }}
              rows={3}
              placeholder="@devkun can you implement the login screen? @fred coordinate with backend."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />

            {/* Autocomplete dropdown */}
            {showDropdown && (
              <div className="absolute bottom-full mb-1 left-0 w-full bg-gray-800 border border-gray-600 rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                {memberSuggestions.map((m) => (
                  <button
                    key={m.agent_id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(m.alias); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center gap-2 text-sm"
                  >
                    <span className="text-blue-400 font-mono">@{m.alias}</span>
                    <span className="text-gray-500 text-xs">{m.agent_id}</span>
                    {m.role_description && (
                      <span className="text-gray-600 text-xs ml-auto">{m.role_description}</span>
                    )}
                  </button>
                ))}
                {groupSuggestions.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(`group:${g.id}`); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center gap-2 text-sm"
                  >
                    <span className="text-purple-400 font-mono">@group:{g.id}</span>
                    <span className="text-gray-500 text-xs">{g.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Member chips for quick insert */}
          {members.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {members.map((m) => (
                <button
                  key={m.agent_id}
                  type="button"
                  onClick={() => setText((t) => t + `@${m.alias} `)}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-blue-400 font-mono"
                >
                  @{m.alias}
                </button>
              ))}
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setText((t) => t + `@group:${g.id} `)}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-purple-400 font-mono"
                >
                  @group:{g.id}
                </button>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-1.5 rounded text-sm transition-colors"
          >
            {loading ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </FormPanel>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = TYPE_COLORS[msg.type] ?? "text-gray-400";

  let pretty = msg.payload;
  try {
    pretty = JSON.stringify(JSON.parse(msg.payload), null, 2);
  } catch {
    /* keep raw */
  }

  return (
    <div className="bg-gray-800 rounded p-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-300 font-mono">
          {msg.from_alias ? `@${msg.from_alias}` : msg.from_agent}
        </span>
        {msg.to_alias && (
          <>
            <span className="text-gray-600">→</span>
            <span className="text-gray-300 font-mono">
              {msg.to_alias === "all" ? "all" : `@${msg.to_alias}`}
            </span>
          </>
        )}
        <span className={`ml-auto font-semibold uppercase ${typeColor}`}>{msg.type}</span>
        <StatusBadge status={msg.status} />
      </div>
      <button onClick={() => setExpanded(!expanded)} className="text-left w-full">
        {expanded ? (
          <pre className="whitespace-pre-wrap text-gray-300">{pretty}</pre>
        ) : (
          <span className="text-gray-500 truncate block">
            {msg.payload.slice(0, 80)}
            {msg.payload.length > 80 ? "…" : ""}
          </span>
        )}
      </button>
    </div>
  );
}
