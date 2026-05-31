import React, { useState } from "react";
import { UserPlus, Copy, Check, ArrowLeft } from "lucide-react";
import { Dialog, Field, TextInput, TextArea, Button } from "../ui";
import { useHub } from "../../lib/store";

interface FormState {
  alias: string;
  group: string;
  role: string;
  workingDir: string;
  extraContext: string;
}

const EMPTY: FormState = { alias: "", group: "", role: "", workingDir: "", extraContext: "" };

/**
 * Build the ready-to-paste agent prompt for a channel member.
 *
 * @param form - Collected agent details.
 * @param channelId - Channel the agent is joining.
 * @param channelTopic - Human description of the channel.
 * @returns A CLAUDE.md-style prompt string.
 */
export function buildAgentPrompt(form: FormState, channelId: string, channelTopic: string): string {
  const { alias, group, role, workingDir, extraContext } = form;
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

  return `\
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
${extraContext.trim() ? `\n# Channel context\n${extraContext.trim()}\n` : ""}`;
}

interface Props {
  channelId: string;
  channelTopic: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog that invites an agent: it registers the membership (via the store) AND
 * produces a ready-to-paste prompt the agent can run to join and start working.
 */
export function InviteDialog({ channelId, channelTopic, open, onClose }: Props) {
  const invite = useHub((s) => s.invite);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function close() {
    setForm(EMPTY);
    setOutput(null);
    setCopied(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.alias.trim()) return;
    setLoading(true);
    await invite(channelId, {
      alias: form.alias.trim(),
      role: form.role,
      group: form.group,
      extraContext: form.extraContext,
    });
    setOutput(buildAgentPrompt(form, channelId, channelTopic));
    setLoading(false);
  }

  async function copy() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={output === null ? "Invite agent" : `@${form.alias.trim()} added`}
      icon={<UserPlus size={16} />}
      widthClass="max-w-lg"
    >
      {output === null ? (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs leading-relaxed text-zinc-500">
            Add an agent to this channel and get a ready-to-paste prompt that joins
            and starts its work loop.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Alias *">
              <TextInput value={form.alias} onChange={set("alias")} placeholder="bon" mono autoFocus />
            </Field>
            <Field label="Group">
              <TextInput value={form.group} onChange={set("group")} placeholder="crm" mono />
            </Field>
          </div>

          <Field label="Role">
            <TextInput value={form.role} onChange={set("role")} placeholder="Backend API agent" />
          </Field>

          <Field label="Working directory">
            <TextInput value={form.workingDir} onChange={set("workingDir")} placeholder="/workspace/crm/backend" mono />
          </Field>

          <Field label="Extra context for this agent" hint="Injected as channel context targeted at this agent.">
            <TextArea
              value={form.extraContext}
              onChange={set("extraContext")}
              rows={3}
              placeholder="Use JWT for auth. API base URL is https://api.crm.internal."
            />
          </Field>

          <Button type="submit" full disabled={!form.alias.trim() || loading}>
            {loading ? "Adding…" : "Add & generate prompt"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Paste this into the agent's session or its <code className="text-indigo-400">CLAUDE.md</code>.
          </p>
          <textarea
            readOnly
            value={output}
            rows={14}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full select-all resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300 focus:border-indigo-600 focus:outline-none"
          />
          <div className="flex gap-2">
            <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => { setForm(EMPTY); setOutput(null); }}>
              Add another
            </Button>
            <Button full icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copy}>
              {copied ? "Copied!" : "Copy prompt"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
