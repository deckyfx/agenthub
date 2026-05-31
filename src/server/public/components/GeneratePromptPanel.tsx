import React, { useState } from "react";

interface Props {
  channelId: string;
  channelTopic: string;
}

interface FormState {
  alias: string;
  group: string;
  role: string;
  workingDir: string;
  extraContext: string;
}

const EMPTY: FormState = {
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
    const { alias, group, role, workingDir, extraContext } = form;
    if (!alias.trim()) return;
    const me = alias.trim();

    const joinCmd = [
      `agenthub channel:join`,
      `  --channel ${channelId}`,
      `  --alias  ${me}`,
      role.trim() ? `  --role   "${role.trim()}"` : null,
      group.trim() ? `  --group  ${group.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" \\\n");

    const prompt = `\
# Your Identity
- You are @${me} in channel ${channelId} — ${channelTopic}
${role.trim() ? `- Role:  ${role.trim()}\n` : ""}\
${group.trim() ? `- Group: ${group.trim()}\n` : ""}\
${workingDir.trim() ? `- Working directory: ${workingDir.trim()}\n` : ""}\
Your alias @${me} is your identity — you use it for every command.

# One-time setup
1. Allow agenthub commands to run without a permission prompt. Add this to
   .claude/settings.json in your working directory (create the file if it does
   not exist, or merge into the existing "allow" array), then restart the
   session so it takes effect:

   {
     "permissions": {
       "allow": ["Bash(agenthub:*)"]
     }
   }

   Run agenthub commands as plain top-level commands — do NOT wrap them in
   $(...) or chain them with && , or the allow rule won't match and you'll be
   prompted anyway.

2. Join the channel (this registers you automatically):
${joinCmd}

# Work loop — stay in this loop the entire time you are active
1. agenthub agent:heartbeat --as ${me} --status working
2. agenthub inbox:poll --as ${me}
3. Apply moderator context FIRST (highest priority), then read the messages.
4. A message is FOR YOU when it @mentions ${`@${me}`}${group.trim() ? ` or @group:${group.trim()}` : ""},
   or when it has no @mention (a channel-wide broadcast).
5. Act on the pending messages — do the work.
6. Reply, addressing peers by @alias in the text:
   agenthub message:send \\
     --as ${me} \\
     --channel ${channelId} \\
     --payload "/result @<peer> the endpoint is ready"
7. Mark each message you handled as done:
   agenthub message:done --as ${me} --id <id>
8. GO BACK TO STEP 1 and poll again. Finishing a task is NOT a reason to stop.
   Only go idle when inbox:poll returns nothing AND
   "agenthub inbox:wait --as ${me} --timeout 30" times out — and even then,
   prefer to keep waiting and re-polling rather than ending your turn.

# Loop discipline — important
- After you finish ANY task, your VERY NEXT action is inbox:poll — not a
  summary, not a stop. Poll first.
- If anyone tells you to "read messages", "check messages", or "check the
  inbox", that means START (or resume) this work loop — poll, act, reply, then
  keep looping — not a single one-off read.

# Addressing others
- @alias targets a member · @group:<id> targets a group · no @mention = everyone
- An optional leading /type sets the kind: /task /question /result /status …
  (the slash must come first, e.g. "/result @alice done")
- Check channel_members in inbox:poll to see who is present
- Write naturally: "@alice the endpoint is ready, see the payload"

# Priority order
1. Moderator context (urgent) — pause current work, apply immediately
2. Moderator context (normal) — apply before the next action
3. Messages from peers
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
                disabled={!form.alias.trim()}
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
                rows={20}
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
