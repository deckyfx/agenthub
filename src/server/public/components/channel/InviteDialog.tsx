import React, { useState } from "react";
import { UserPlus, ArrowLeft } from "lucide-react";
import { Dialog, Field, TextInput, TextArea, Button } from "../ui";
import { useHub } from "../../lib/store";
import { PromptView } from "./PromptView";
import { PromptTldr } from "./PromptTldr";

interface FormState {
  alias: string;
  group: string;
  role: string;
  workingDir: string;
  extraContext: string;
}

const EMPTY: FormState = { alias: "", group: "", role: "", workingDir: "", extraContext: "" };

interface Props {
  channelId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog that invites an agent: it registers the membership (via the store) AND
 * produces a ready-to-paste prompt the agent can run to join and start working.
 *
 * The prompt itself is generated server-side (see `src/server/agent-prompt.ts`)
 * and fetched back once the member exists, so invite-time and later re-display
 * always render from the same template.
 */
export function InviteDialog({ channelId, open, onClose }: Props) {
  const invite = useHub((s) => s.invite);
  const getAgentPrompt = useHub((s) => s.getAgentPrompt);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function close() {
    setForm(EMPTY);
    setOutput(null);
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const alias = form.alias.trim();
    if (!alias) return;
    setLoading(true);
    setError(null);
    try {
      await invite(channelId, {
        alias,
        role: form.role,
        group: form.group,
        workingDir: form.workingDir,
        extraContext: form.extraContext,
      });
      setOutput(await getAgentPrompt(channelId, alias));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={output === null ? "Invite agent" : `@${form.alias.trim()} added`}
      icon={<UserPlus size={16} />}
      widthClass={output === null ? "max-w-lg" : "max-w-3xl"}
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

          {error && (
            <p className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-400">
              {error}
            </p>
          )}

          <Button type="submit" full disabled={!form.alias.trim() || loading}>
            {loading ? "Adding…" : "Add & generate prompt"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Paste this into the agent's session or its <code className="text-indigo-400">CLAUDE.md</code>.
          </p>
          <PromptTldr channelId={channelId} alias={form.alias.trim()} />
          <PromptView prompt={output} rows={22} />
          <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => { setForm(EMPTY); setOutput(null); }}>
            Add another
          </Button>
        </div>
      )}
    </Dialog>
  );
}
