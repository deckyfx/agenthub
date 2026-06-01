import React, { useState } from "react";
import { Hash } from "lucide-react";
import { Dialog, Field, TextInput, TextArea, Button } from "../ui";
import { useHub } from "../../lib/store";

/** Dialog to create a channel with an optional seed of background context. */
export function NewChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createChannel = useHub((s) => s.createChannel);
  const [id, setId] = useState("");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !topic.trim()) return;
    setLoading(true);
    await createChannel(id.trim(), topic.trim(), context);
    setId(""); setTopic(""); setContext("");
    setLoading(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New channel" icon={<Hash size={16} />} widthClass="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Channel ID">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="ch-auth" mono autoFocus />
        </Field>
        <Field label="Topic">
          <TextInput value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Implement authentication feature" />
        </Field>
        <Field label="Background context" hint="Optional — shared with everyone who joins.">
          <TextArea value={context} onChange={(e) => setContext(e.target.value)} rows={8} placeholder="Initial notes, goals, or constraints agents should know…" />
        </Field>
        <Button type="submit" full disabled={!id.trim() || !topic.trim() || loading}>
          {loading ? "Creating…" : "Create channel"}
        </Button>
      </form>
    </Dialog>
  );
}
