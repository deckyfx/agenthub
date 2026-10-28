import { useState } from "react";
import { hubStore } from "../lib/store";
import { Button, Dialog, ErrorText, Field, Input, Textarea } from "./ui";

/** Create a room; on success it becomes the open thread. */
export function NewRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await hubStore.getState().createRoom({ name, topic: topic || undefined, context: context || undefined });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setName("");
    setTopic("");
    setContext("");
    setError("");
    onClose();
    window.location.hash = `#/room/${res.data.id}`;
  };

  return (
    <Dialog
      title="New room"
      open={open}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={submit}>Create room</Button>
        </>
      }
    >
      <Field label="Name" hint="Becomes the #slug agents tag their messages with.">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="checkout-feature" />
      </Field>
      <Field label="Topic">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ship the new checkout flow across api + web" />
      </Field>
      <Field label="Context" hint="Sent to every member in their join briefing: goals, constraints, who owns what.">
        <Textarea rows={6} value={context} onChange={(e) => setContext(e.target.value)} placeholder="The API contract lives in api/openapi.yaml…" />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  );
}
