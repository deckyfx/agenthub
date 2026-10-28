import { useMemo, useState } from "react";
import { PERMISSION_MODES, type PermissionMode } from "../../core/permission-modes";
import { hubStore, useHub } from "../lib/store";
import { Button, Dialog, ErrorText, Field, Input, Select, Textarea } from "./ui";

const MODE_HINTS: Record<PermissionMode, string> = {
  manual: "asks before every tool",
  acceptEdits: "auto-approves file edits",
  auto: "classifier approves safe actions",
  plan: "read-only planning",
  dontAsk: "denies anything not pre-allowed",
  bypassPermissions: "⚠ approves everything",
};

/**
 * Start a background Claude Code session (`claude --bg`) in a repo,
 * optionally dropping it straight into a room.
 */
export function SpawnDialog({ open, onClose, roomId }: { open: boolean; onClose: () => void; roomId?: string }) {
  const sessions = useHub((s) => s.sessions);
  const rooms = useHub((s) => s.rooms);
  const [cwd, setCwd] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PermissionMode | "">("");
  const [model, setModel] = useState("");
  const [room, setRoom] = useState(roomId ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Suggest directories that already host sessions or room members.
  const dirs = useMemo(() => {
    const all = new Set<string>();
    for (const s of sessions) if (s.cwd) all.add(s.cwd);
    for (const r of rooms) for (const m of r.members) if (m.cwd) all.add(m.cwd);
    return [...all].sort();
  }, [sessions, rooms]);

  const submit = async () => {
    setBusy(true);
    setError("");
    const res = await hubStore.getState().spawn({
      cwd: cwd.trim(),
      name: name.trim(),
      prompt: prompt.trim() || undefined,
      permissionMode: mode || undefined,
      model: model.trim() || undefined,
      roomId: room || undefined,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    hubStore.getState().notify("info", `Spawned ${name}${res.data.jobId ? ` (job ${res.data.jobId})` : ""}`);
    onClose();
    if (res.data.session && !room) window.location.hash = `#/session/${res.data.session.sessionId}`;
    if (room) window.location.hash = `#/room/${room}`;
  };

  return (
    <Dialog
      title="Spawn a background agent"
      open={open}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!cwd.trim() || !name.trim() || busy} onClick={submit}>
            {busy ? "Starting…" : "Spawn"}
          </Button>
        </>
      }
    >
      <Field label="Working directory" hint="Must be a workspace you've trusted in Claude Code (run `claude` there once).">
        <Input list="agenthub-dirs" value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/Users/me/code/web" />
        <datalist id="agenthub-dirs">
          {dirs.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Session name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="web-helper" />
        </Field>
        <Field label="Model" hint="Blank = your default">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-5-5" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Permission mode" hint={mode ? MODE_HINTS[mode] : "Claude Code's normal behaviour"}>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PermissionMode | "")}>
            <option value="">Default</option>
            {PERMISSION_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Join room" hint="It gets the room briefing once it registers.">
          <Select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">None</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>#{r.id}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Initial prompt">
        <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="You're the web-side agent for the checkout feature. Wait for the room briefing, then…" />
      </Field>
      <p className="text-xs text-zinc-500">
        Manual-mode agents pause on tool approvals; open them with <code className="text-zinc-300">claude attach &lt;job&gt;</code> to approve.
      </p>
      <ErrorText>{error}</ErrorText>
    </Dialog>
  );
}
