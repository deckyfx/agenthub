import React, { useState } from "react";

interface Props {
  channelId: string;
  channelTopic: string;
}

interface FormState {
  agentId: string;
  alias: string;
  group: string;
  role: string;
  workingDir: string;
  extraContext: string;
}

const EMPTY: FormState = {
  agentId: "",
  alias: "",
  group: "",
  role: "",
  workingDir: "",
  extraContext: "",
};

/**
 * Guided panel that collects agent details and generates a ready-to-paste
 * prompt (or CLAUDE.md snippet) for inviting an agent into this channel.
 */
export function GeneratePromptPanel({ channelId, channelTopic }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [output, setOutput] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function generate() {
    const { agentId, alias, group, role, workingDir, extraContext } = form;
    if (!agentId.trim() || !alias.trim()) return;

    const joinCmd = [
      `agenthub channel:join`,
      `  --agent  ${agentId.trim()}`,
      `  --channel ${channelId}`,
      `  --alias  ${alias.trim()}`,
      role.trim() ? `  --role   "${role.trim()}"` : null,
      group.trim() ? `  --group  ${group.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" \\\n");

    const registerCmd = workingDir.trim()
      ? `agenthub agent:register --id ${agentId.trim()} --dir ${workingDir.trim()} --name "${role.trim() || agentId.trim()}"`
      : `# agenthub agent:register --id ${agentId.trim()} --dir <your-repo-path> --name "${role.trim() || agentId.trim()}"`;

    const prompt = `\
# Agent Identity
- Agent ID:  ${agentId.trim()}
- Channel:   ${channelId} — ${channelTopic}
- Alias:     @${alias.trim()}
${role.trim() ? `- Role:      ${role.trim()}\n` : ""}\
${group.trim() ? `- Group:     ${group.trim()}\n` : ""}\
${workingDir.trim() ? `- Working directory: ${workingDir.trim()}\n` : ""}\

# Startup — run once at the beginning of this session
${registerCmd}
${joinCmd}

# Work loop — repeat every iteration
1. agenthub agent:heartbeat --id ${agentId.trim()} --status working
2. agenthub inbox:poll --agent ${agentId.trim()}
3. Read the response — apply moderator context first (highest priority)
4. Act on pending messages
5. Send results:
   agenthub message:send \\
     --from @${alias.trim()} \\
     --channel ${channelId} \\
     --to @<peer-alias> \\
     --type result \\
     --payload '{"key":"value"}'
6. When waiting for a peer:
   agenthub inbox:wait --agent ${agentId.trim()} --timeout 30
   Then re-poll.

# Addressing peers
- Use @alias when addressing agents in this channel
- Check channel_members in the inbox:poll response to see who is present
- Sign messages naturally: "Hey @alice, here is my result…"

# Priority order
1. Moderator context (urgent) — pause current work, apply immediately
2. Moderator context (normal) — apply before the next action
3. Messages from the orchestrator
4. Messages from peer agents
${
  extraContext.trim()
    ? `\n# Channel context\n${extraContext.trim()}\n`
    : ""
}`;

    setOutput(prompt);
  }

  async function copy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setForm(EMPTY);
    setOutput(null);
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => { setOpen((v) => !v); if (open) reset(); }}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
      >
        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
          Generate Agent Prompt
        </span>
        <span className="text-gray-600 text-xs">{open ? "✕" : "↗"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 p-3 space-y-3">
          {output === null ? (
            /* ── Form ── */
            <>
              <p className="text-xs text-gray-500 leading-relaxed">
                Fill in the agent details and get a ready-to-paste CLAUDE.md prompt.
              </p>

              <FormField label="Agent ID *" mono>
                <input
                  value={form.agentId}
                  onChange={set("agentId")}
                  placeholder="crm-backend"
                  className={INPUT}
                />
              </FormField>

              <FormField label="Alias (without @) *" mono>
                <input
                  value={form.alias}
                  onChange={set("alias")}
                  placeholder="bon"
                  className={INPUT}
                />
              </FormField>

              <FormField label="Group" mono>
                <input
                  value={form.group}
                  onChange={set("group")}
                  placeholder="crm"
                  className={INPUT}
                />
              </FormField>

              <FormField label="Role description">
                <input
                  value={form.role}
                  onChange={set("role")}
                  placeholder="Backend API agent"
                  className={INPUT}
                />
              </FormField>

              <FormField label="Working directory" mono>
                <input
                  value={form.workingDir}
                  onChange={set("workingDir")}
                  placeholder="/workspace/crm/backend"
                  className={INPUT}
                />
              </FormField>

              <FormField label="Extra context for this agent">
                <textarea
                  value={form.extraContext}
                  onChange={set("extraContext")}
                  placeholder="Use JWT for auth. API base URL is https://api.crm.internal. Follow Laravel conventions."
                  rows={3}
                  className={`${INPUT} resize-none`}
                />
              </FormField>

              <button
                onClick={generate}
                disabled={!form.agentId.trim() || !form.alias.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-1.5 rounded text-sm transition-colors"
              >
                Generate Prompt
              </button>
            </>
          ) : (
            /* ── Output ── */
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Paste this into the agent's <code className="text-blue-400">CLAUDE.md</code> or directly into the Claude session.
                </p>
                <button
                  onClick={reset}
                  className="text-xs text-gray-600 hover:text-gray-300 ml-2 shrink-0"
                >
                  ← Edit
                </button>
              </div>

              <textarea
                readOnly
                value={output}
                rows={12}
                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-2 text-xs text-gray-300 font-mono resize-none focus:outline-none focus:border-blue-600 select-all"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />

              <button
                onClick={copy}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-1.5 rounded text-sm transition-colors"
              >
                {copied ? "✓ Copied!" : "Copy to clipboard"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INPUT =
  "w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500";

function FormField({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`text-xs text-gray-500 mb-1 ${mono ? "font-mono" : ""}`}>
        {label}
      </p>
      {children}
    </div>
  );
}
