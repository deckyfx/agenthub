import { Hash, Plus, Radio, Rocket } from "lucide-react";
import { threadKey, type Thread } from "../../lib/hub-store";
import { useHub } from "../lib/store";
import { tildify } from "../lib/format";
import { cx, IconButton, StatusDot } from "./ui";

function Badge({ n }: { n: number | undefined }) {
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">{n > 99 ? "99+" : n}</span>;
}

function isSelected(sel: Thread | null, t: Thread): boolean {
  return sel !== null && threadKey(sel) === threadKey(t);
}

/** Left rail: connection state, rooms, live sessions. */
export function Sidebar({ onNewRoom, onSpawn }: { onNewRoom: () => void; onSpawn: () => void }) {
  const connected = useHub((s) => s.connected);
  const rooms = useHub((s) => s.rooms);
  const sessions = useHub((s) => s.sessions);
  const unread = useHub((s) => s.unread);
  const selected = useHub((s) => s.selected);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60">
      <a href="#/" className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Radio className="size-5 text-indigo-400" />
        <span className="font-semibold text-zinc-100">AgentHub</span>
        <span className={cx("ml-auto flex items-center gap-1.5 text-xs", connected ? "text-emerald-400" : "text-rose-400")}>
          <span className={cx("size-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse")} />
          {connected ? "live" : "offline"}
        </span>
      </a>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        <section>
          <header className="mb-1 flex items-center px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Rooms
            <IconButton className="ml-auto size-6" onClick={onNewRoom} title="New room">
              <Plus className="size-3.5" />
            </IconButton>
          </header>
          {rooms.length === 0 && <p className="px-2 py-1 text-xs text-zinc-600">No rooms yet</p>}
          {rooms.map((r) => {
            const t: Thread = { kind: "room", id: r.id };
            const online = r.members.filter((m) => m.online).length;
            return (
              <a
                key={r.id}
                href={`#/room/${r.id}`}
                className={cx("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm", isSelected(selected, t) ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200")}
              >
                <Hash className="size-4 shrink-0 text-zinc-500" />
                <span className="truncate">{r.id}</span>
                {r.paused && <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-300">paused</span>}
                <span className="text-xs text-zinc-600">{online}/{r.members.length}</span>
                <Badge n={unread[threadKey(t)]} />
              </a>
            );
          })}
        </section>

        <section>
          <header className="mb-1 flex items-center px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sessions <span className="ml-1.5 text-zinc-600">{sessions.length}</span>
            <IconButton className="ml-auto size-6" onClick={onSpawn} title="Spawn background agent">
              <Rocket className="size-3.5" />
            </IconButton>
          </header>
          {sessions.length === 0 && <p className="px-2 py-1 text-xs text-zinc-600">No live Claude Code sessions</p>}
          {sessions.map((s) => {
            const t: Thread = { kind: "session", sessionId: s.sessionId };
            return (
              <a
                key={s.sessionId}
                href={`#/session/${s.sessionId}`}
                title={`${s.cwd}\npid ${s.pid} · ${s.entrypoint} · v${s.version}`}
                className={cx("flex items-center gap-2 rounded-md px-2 py-1.5", isSelected(selected, t) ? "bg-zinc-800" : "hover:bg-zinc-800/60")}
              >
                <StatusDot status={s.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-200">{s.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{tildify(s.cwd)}</span>
                </span>
                {s.kind === "bg" && <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">bg</span>}
                <Badge n={unread[threadKey(t)]} />
              </a>
            );
          })}
        </section>
      </nav>
    </aside>
  );
}
