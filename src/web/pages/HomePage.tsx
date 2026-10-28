import { Hash, Plus, Rocket } from "lucide-react";
import { useHub } from "../lib/store";
import { ago, tildify } from "../lib/format";
import { Button, StatusDot } from "../components/ui";

/** Overview: what's running, what rooms exist, how the relay works. */
export function HomePage({ onNewRoom, onSpawn }: { onNewRoom: () => void; onSpawn: () => void }) {
  const sessions = useHub((s) => s.sessions);
  const rooms = useHub((s) => s.rooms);
  const health = useHub((s) => s.health);
  const busy = sessions.filter((s) => s.status === "busy").length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <header className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-zinc-100">Command center</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {sessions.length} live session{sessions.length === 1 ? "" : "s"} · {busy} busy · {rooms.length} room{rooms.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button onClick={onSpawn}>
            <Rocket className="size-4" /> Spawn agent
          </Button>
          <Button variant="primary" onClick={onNewRoom}>
            <Plus className="size-4" /> New room
          </Button>
        </header>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Sessions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <a key={s.sessionId} href={`#/session/${s.sessionId}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700">
                <div className="flex items-center gap-2">
                  <StatusDot status={s.status} />
                  <span className="truncate font-medium text-zinc-100">{s.name}</span>
                  <span className="ml-auto text-xs text-zinc-500">{s.status} {ago(s.statusUpdatedAt)}</span>
                </div>
                <p className="mt-2 truncate font-mono text-xs text-zinc-400">{tildify(s.cwd)}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  pid {s.pid} · {s.kind === "bg" ? "background" : s.entrypoint}
                </p>
              </a>
            ))}
            {sessions.length === 0 && <p className="text-sm text-zinc-600">No Claude Code sessions running. Start one, or spawn a background agent.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Rooms</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((r) => (
              <a key={r.id} href={`#/room/${r.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700">
                <div className="flex items-center gap-1.5 font-medium text-zinc-100">
                  <Hash className="size-4 text-zinc-500" /> {r.id}
                  {r.paused && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-300">paused</span>}
                </div>
                {r.topic && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{r.topic}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.members.map((m) => (
                    <span key={m.sessionId} className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                      <StatusDot status={m.status} online={m.online} /> @{m.alias}
                    </span>
                  ))}
                  {r.members.length === 0 && <span className="text-xs text-zinc-600">no members</span>}
                </div>
              </a>
            ))}
            {rooms.length === 0 && <p className="text-sm text-zinc-600">Rooms connect sessions across repos. Create one and add sessions to it.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
          <h2 className="mb-2 font-medium text-zinc-200">How the relay works</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>AgentHub reads the session registry Claude Code keeps in <code className="text-zinc-300">{health ? tildify(health.sessionsDir) : "~/.claude/sessions"}</code>.</li>
            <li>Messages go straight to each session's own messaging socket and land in its next turn. Agents don't install or poll anything.</li>
            <li>
              Agents reply with their built-in SendMessage to <code className="text-zinc-300">{health?.address ?? "the hub address"}</code>. The hub logs the reply and fans it out to the room.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
