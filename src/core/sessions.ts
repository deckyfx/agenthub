import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Glob } from "bun";
import { envConfig } from "../env-config";
import { catchError, catchSync } from "../lib/error-handler";
import { TypedEmitter } from "../lib/emitter";
import { isSocket } from "../lib/fs";
import { AmbiguousSessionError, SessionNotFoundError } from "../errors/custom-errors";

/** Raw `~/.claude/sessions/<pid>.json` record, as Claude Code writes it. */
interface SessionRecord {
  pid: number;
  sessionId: string;
  cwd?: string;
  startedAt: number;
  version?: string;
  peerProtocol?: number;
  peerFeatures?: string[];
  kind?: string;
  entrypoint?: string;
  messagingSocketPath?: string;
  name?: string;
  status?: string;
  statusUpdatedAt?: number;
  updatedAt?: number;
  jobId?: string;
}

/** Busy = mid-turn; idle = waiting for input. */
export type SessionStatus = "busy" | "idle" | "unknown";

/** A live Claude Code session the hub can message. */
export interface Session {
  pid: number;
  /** Stable conversation id — survives `--resume`, unlike the pid. */
  sessionId: string;
  name: string;
  cwd: string;
  /** Last path segment of `cwd`, for compact display. */
  project: string;
  status: SessionStatus;
  /** `interactive`, `bg`, `daemon`, … */
  kind: string;
  /** `cli`, `claude-vscode`, … */
  entrypoint: string;
  version: string;
  peerProtocol: number | undefined;
  socketPath: string;
  /** Background job id for `claude stop/logs/attach` (bg sessions only). */
  jobId?: string;
  startedAt: number;
  statusUpdatedAt: number;
}

/** Events emitted by {@link SessionRegistry}. */
interface SessionEvents extends Record<string, unknown> {
  /** Full snapshot after any change. */
  change: Session[];
  /** A session (by sessionId) became reachable. */
  online: Session;
  /** A session (by sessionId) disappeared. */
  offline: Session;
}

/** True when a process with this pid exists (signal 0 probes without killing). */
function pidAlive(pid: number): boolean {
  const [err] = catchSync(() => process.kill(pid, 0));
  // EPERM = exists but owned by someone else; still alive.
  return err === undefined || (err as NodeJS.ErrnoException).code === "EPERM";
}

function toSession(r: SessionRecord): Session | undefined {
  if (!r.messagingSocketPath || !Number.isInteger(r.pid) || !r.sessionId) return undefined;
  const cwd = r.cwd ?? "";
  const status: SessionStatus = r.status === "busy" || r.status === "idle" ? r.status : "unknown";
  return {
    pid: r.pid,
    sessionId: r.sessionId,
    name: r.name ?? `pid ${r.pid}`,
    cwd,
    project: cwd ? basename(cwd) : "?",
    status,
    kind: r.kind ?? "interactive",
    entrypoint: r.entrypoint ?? "unknown",
    version: r.version ?? "",
    peerProtocol: r.peerProtocol,
    socketPath: r.messagingSocketPath,
    jobId: r.jobId,
    startedAt: r.startedAt,
    statusUpdatedAt: r.statusUpdatedAt ?? r.updatedAt ?? r.startedAt,
  };
}

/** Cheap fingerprint so we only emit when something visible changed. */
function fingerprint(s: Session): string {
  return `${s.pid}|${s.name}|${s.status}|${s.statusUpdatedAt}|${s.socketPath}`;
}

/**
 * Live view of every Claude Code session on this machine, built from the
 * registry files Claude Code maintains in `~/.claude/sessions/`.
 *
 * Watches the directory (debounced) with a slow interval as a safety net,
 * since fs events can be coalesced or missed.
 */
export class SessionRegistry extends TypedEmitter<SessionEvents> {
  private sessions = new Map<string, Session>();
  private watcher: FSWatcher | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private scanning: Promise<void> | undefined;

  constructor(private readonly dir: string = envConfig.SESSIONS_DIR) {
    super();
  }

  /** Initial scan + start watching. */
  async start(): Promise<void> {
    await this.refresh();
    const [err, watcher] = catchSync(() => watch(this.dir, () => this.schedule()));
    if (err) console.warn(`[sessions] cannot watch ${this.dir} (${err.message}); polling only`);
    else this.watcher = watcher;
    this.timer = setInterval(() => this.schedule(), 3000);
  }

  stop(): void {
    this.watcher?.close();
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
  }

  private schedule(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.refresh(), 150);
  }

  /** Rescan the registry dir. Concurrent calls share one scan. */
  refresh(): Promise<void> {
    this.scanning ??= this.scan().finally(() => (this.scanning = undefined));
    return this.scanning;
  }

  private async scan(): Promise<void> {
    const next = new Map<string, Session>();
    const files = await Array.fromAsync(new Glob("*.json").scan({ cwd: this.dir, onlyFiles: true }));
    await Promise.all(
      files.map(async (file) => {
        if (!/^\d+\.json$/.test(file)) return;
        const [err, record] = await catchError(Bun.file(join(this.dir, file)).json() as Promise<SessionRecord>);
        // Files are rewritten in place; a torn read just waits for the next scan.
        if (err) return;
        const session = toSession(record);
        if (!session || !pidAlive(session.pid)) return;
        if (!(await isSocket(session.socketPath))) return;
        // Same conversation can be briefly listed twice across a restart; keep the newest.
        const prev = next.get(session.sessionId);
        if (!prev || prev.startedAt < session.startedAt) next.set(session.sessionId, session);
      }),
    );

    let changed = next.size !== this.sessions.size;
    for (const [id, s] of next) {
      const prev = this.sessions.get(id);
      if (!prev) this.emit("online", s);
      if (!prev || fingerprint(prev) !== fingerprint(s)) changed = true;
    }
    for (const [id, s] of this.sessions) if (!next.has(id)) this.emit("offline", s);

    this.sessions = next;
    if (changed) this.emit("change", this.list());
  }

  /** All live sessions, most recently active first. */
  list(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.statusUpdatedAt - a.statusUpdatedAt);
  }

  /** Look up a live session by its stable conversation id. */
  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /** Find the session owning a socket path (identifies who sent us a frame). */
  bySocket(socketPath: string): Session | undefined {
    for (const s of this.sessions.values()) if (s.socketPath === socketPath) return s;
    return undefined;
  }

  /**
   * Resolve a user-supplied reference: pid, session id (or prefix), or name.
   *
   * @throws SessionNotFoundError | AmbiguousSessionError
   */
  resolve(ref: string): Session {
    const all = this.list();
    const byPid = /^\d+$/.test(ref) ? all.find((s) => s.pid === Number(ref)) : undefined;
    if (byPid) return byPid;
    const exactId = this.sessions.get(ref);
    if (exactId) return exactId;
    const needle = ref.toLowerCase();
    const matches = all.filter(
      (s) => s.name.toLowerCase() === needle || (needle.length >= 6 && s.sessionId.startsWith(needle)),
    );
    if (matches.length === 1 && matches[0]) return matches[0];
    if (matches.length > 1) throw new AmbiguousSessionError(ref, matches.map((s) => `${s.name} (pid ${s.pid}, ${s.project})`));
    throw new SessionNotFoundError(ref);
  }

  /**
   * Directory most live sessions keep their sockets in — where the hub
   * socket must live so replies are accepted.
   */
  dominantSocketDir(): string | undefined {
    const counts = new Map<string, number>();
    for (const s of this.sessions.values()) {
      const d = dirname(s.socketPath);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
}
