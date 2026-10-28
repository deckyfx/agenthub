import { useEffect, useState } from "react";
import type { RoomView } from "../../core/hub";
import { hubStore } from "../lib/store";
import { Button, Dialog, ErrorText, Field, Input, Textarea } from "./ui";

/** Edit a room's topic / context, or close it. */
export function RoomSettingsDialog({ room, open, onClose }: { room: RoomView; open: boolean; onClose: () => void }) {
  const [topic, setTopic] = useState(room.topic);
  const [context, setContext] = useState(room.context);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTopic(room.topic);
    setContext(room.context);
    setError("");
  }, [open, room.topic, room.context]);

  const save = async () => {
    const res = await hubStore.getState().updateRoom(room.id, { topic, context });
    if (!res.ok) return setError(res.error);
    onClose();
  };

  const remove = async () => {
    if (!window.confirm(`Close #${room.id}? Members are told to stop sending to it and its history is deleted.`)) return;
    const res = await hubStore.getState().deleteRoom(room.id);
    if (!res.ok) return setError(res.error);
    onClose();
    window.location.hash = "#/";
  };

  return (
    <Dialog
      title={`#${room.id} settings`}
      open={open}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={remove}>Close room</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <Field label="Topic">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
      </Field>
      <Field label="Context" hint="Used in briefings for members who join from now on.">
        <Textarea rows={8} value={context} onChange={(e) => setContext(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  );
}
