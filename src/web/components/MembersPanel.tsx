import { useState } from "react";
import { Rocket, UserPlus, X } from "lucide-react";
import type { RoomView } from "../../core/hub";
import { hubStore, useHub } from "../lib/store";
import { tildify } from "../lib/format";
import { Button, IconButton, Input, Select, StatusDot } from "./ui";

/** Right rail of a room: roster with presence, add / remove members. */
export function MembersPanel({ room, onSpawn }: { room: RoomView; onSpawn: () => void }) {
  const sessions = useHub((s) => s.sessions);
  const [pick, setPick] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState("");
  const candidates = sessions.filter((s) => !room.members.some((m) => m.sessionId === s.sessionId));

  const add = async () => {
    if (!pick) return;
    const res = await hubStore.getState().addMember(room.id, pick, alias.trim() || undefined);
    if (!res.ok) return setError(res.error);
    setPick("");
    setAlias("");
    setError("");
  };

  const remove = async (sessionId: string, label: string) => {
    if (!window.confirm(`Remove @${label} from #${room.id}?`)) return;
    const res = await hubStore.getState().removeMember(room.id, sessionId);
    if (!res.ok) hubStore.getState().notify("warn", res.error);
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900/40">
      <header className="border-b border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Members · {room.members.length}
      </header>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        <li className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <StatusDot status="idle" />
          <span className="text-sm text-indigo-300">@operator</span>
          <span className="text-xs text-zinc-600">you</span>
        </li>
        {room.members.map((m) => (
          <li key={m.sessionId} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/50">
            <StatusDot status={m.status} online={m.online} />
            <span className="min-w-0 flex-1">
              <a href={`#/session/${m.sessionId}`} className="block truncate text-sm text-zinc-200 hover:underline">
                @{m.alias}
              </a>
              <span className="block truncate text-xs text-zinc-500" title={m.cwd}>
                {m.name} · {tildify(m.cwd)}
              </span>
            </span>
            <IconButton className="opacity-0 group-hover:opacity-100" title="Remove" onClick={() => void remove(m.sessionId, m.alias)}>
              <X className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-zinc-800 p-3">
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add a live session…</option>
          {candidates.map((s) => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.name} — {tildify(s.cwd)}
            </option>
          ))}
        </Select>
        {pick && <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="alias (default: repo name)" />}
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1 justify-center" disabled={!pick} onClick={() => void add()}>
            <UserPlus className="size-4" /> Add
          </Button>
          <Button onClick={onSpawn} title="Spawn a new agent into this room">
            <Rocket className="size-4" /> Spawn
          </Button>
        </div>
      </div>
    </aside>
  );
}
