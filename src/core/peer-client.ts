import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";
import { envConfig } from "../env-config";
import { catchError } from "../lib/error-handler";
import { DeliveryError } from "../errors/custom-errors";
import { buildAuthLine, buildUserFrame, type PeerPriority } from "./peer-protocol";
import type { Session } from "./sessions";

const SEND_TIMEOUT_MS = 5000;

/** What to deliver to a session. */
export interface PeerSend {
  /** Hub reply address (`uds:` …). */
  from: string;
  /** Sender label the receiving model sees (`from-name`). */
  fromName: string;
  body: string;
  priority?: PeerPriority;
}

/**
 * Read the session's peer token from `<pid>.<sha256(socket)>.key`. Optional:
 * Claude Code only enforces auth on Windows, but presenting it is cheap and
 * marks us as a vouched sender.
 */
async function readPeerToken(pid: number): Promise<string | undefined> {
  const dir = envConfig.SESSIONS_DIR;
  for await (const file of new Glob(`${pid}.*.key`).scan({ cwd: dir, onlyFiles: true })) {
    const [err, key] = await catchError(Bun.file(join(dir, file)).json() as Promise<{ peerToken?: unknown }>);
    if (!err && typeof key.peerToken === "string" && /^[0-9a-f]{32}$/.test(key.peerToken)) return key.peerToken;
  }
  return undefined;
}

/** Write `payload` to a Unix socket and close, honouring backpressure. */
function writeOnce(socketPath: string, payload: string): Promise<void> {
  const bytes = new TextEncoder().encode(payload);
  return new Promise((resolve, reject) => {
    let offset = 0;
    let settled = false;
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => settle(new Error(`timed out after ${SEND_TIMEOUT_MS} ms`)), SEND_TIMEOUT_MS);
    const pump = (s: { write(d: Uint8Array): number; end(): void }) => {
      while (offset < bytes.length) {
        const n = s.write(bytes.subarray(offset));
        if (n <= 0) return; // wait for drain
        offset += n;
      }
      s.end();
    };
    Bun.connect({
      unix: socketPath,
      socket: {
        open: pump,
        drain: pump,
        data() {},
        close: () => (offset >= bytes.length ? settle() : settle(new Error("socket closed mid-write"))),
        error: (_s, err) => settle(err),
        connectError: (_s, err) => settle(err),
      },
    }).catch((err: unknown) => settle(err instanceof Error ? err : new Error(String(err))));
  });
}

/** Per-socket chains so messages to one session keep their order. */
const chains = new Map<string, Promise<unknown>>();

/**
 * Deliver one message to a live Claude Code session over its messaging socket.
 *
 * @returns the frame's `msg_id`.
 * @throws DeliveryError when the socket is missing, a symlink, or the write fails.
 */
export function sendToSession(session: Session, msg: PeerSend): Promise<string> {
  const run = async (): Promise<string> => {
    const target = `${session.name} (pid ${session.pid})`;
    const [statErr, stat] = await catchError(lstat(session.socketPath));
    if (statErr) throw new DeliveryError(target, "messaging socket is gone");
    if (stat.isSymbolicLink()) throw new DeliveryError(target, "messaging socket is a symlink");

    const token = await readPeerToken(session.pid);
    const { line, msgId } = buildUserFrame(msg);
    const [err] = await catchError(writeOnce(session.socketPath, (token ? buildAuthLine(token) : "") + line));
    if (err) throw new DeliveryError(target, err.message);
    return msgId;
  };
  const prev = chains.get(session.socketPath) ?? Promise.resolve();
  const next = prev.then(run, run);
  chains.set(session.socketPath, next.catch(() => {}));
  return next;
}
