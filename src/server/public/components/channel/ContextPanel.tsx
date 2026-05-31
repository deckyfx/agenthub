import React, { useMemo, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Dialog, Field, TextArea, Select, Button, cn } from "../ui";
import { useHub, selectMembers } from "../../lib/store";
import type { ContextInjection } from "../../../../db/schema";

/** Right panel: channel background & context, with an Add dialog. */
export function ContextPanel({ channelId }: { channelId: string }) {
  const allContexts = useHub((s) => s.contexts);
  const contexts = useMemo(
    () => allContexts.filter((c) => c.channel_id === channelId),
    [allContexts, channelId],
  );
  const [addOpen, setAddOpen] = useState(false);

  return (
    <aside aria-label="Background and context" className="flex max-h-56 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 lg:max-h-none lg:w-72">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <BookOpen size={15} className="text-zinc-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Background &amp; Context</span>
        <span className="text-xs text-zinc-600">{contexts.length}</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {contexts.length === 0 ? (
          <p className="text-xs text-zinc-600">
            No context yet. Add background, constraints, or goals agents should know.
          </p>
        ) : (
          contexts.map((ctx) => <ContextItem key={ctx.id} ctx={ctx} />)
        )}
      </div>

      <div className="border-t border-zinc-800 p-2">
        <Button variant="secondary" full icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>
          Add context
        </Button>
      </div>

      <AddContextDialog channelId={channelId} open={addOpen} onClose={() => setAddOpen(false)} />
    </aside>
  );
}

function ContextItem({ ctx }: { ctx: ContextInjection }) {
  const [expanded, setExpanded] = useState(false);
  const ts = new Date(ctx.created_at * 1000).toLocaleString();
  const urgent = ctx.priority === "urgent";

  return (
    <div className={cn("rounded-lg border p-2.5 text-xs", urgent ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-zinc-800 bg-zinc-800/40")}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", urgent ? "bg-rose-500/20 text-rose-300" : "bg-zinc-700/60 text-zinc-400")}>
          {ctx.priority}
        </span>
        {ctx.target_agent && ctx.target_agent !== "all" && (
          <span className="font-mono text-indigo-400">@{ctx.target_agent}</span>
        )}
        <span className="ml-auto text-zinc-600">{ts}</span>
      </div>
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        {expanded ? (
          <pre className="whitespace-pre-wrap text-zinc-300">{ctx.content}</pre>
        ) : (
          <span className="block truncate text-zinc-400">{ctx.content}</span>
        )}
      </button>
    </div>
  );
}

function AddContextDialog({ channelId, open, onClose }: { channelId: string; open: boolean; onClose: () => void }) {
  const members = useHub(selectMembers(channelId));
  const addContext = useHub((s) => s.addContext);
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [target, setTarget] = useState("all");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    await addContext(channelId, { content: content.trim(), priority, target });
    setContent(""); setPriority("normal"); setTarget("all");
    setLoading(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add context" icon={<BookOpen size={16} />}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Content">
          <TextArea value={content} onChange={(e) => setContent(e.target.value)} rows={4} autoFocus placeholder="Background information, constraints, or instructions…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Target">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all">All members</option>
              {members.map((m) => (
                <option key={m.agent_id} value={m.alias}>@{m.alias}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" full disabled={!content.trim() || loading}>
          {loading ? "Adding…" : "Add context"}
        </Button>
      </form>
    </Dialog>
  );
}
