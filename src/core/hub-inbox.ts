import { chmod, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { UnixSocketListener } from "bun";
import { catchError, catchSync } from "../lib/error-handler";
import { TypedEmitter } from "../lib/emitter";
import { isSocket } from "../lib/fs";
import { runningServerPid } from "../lib/pidfile";
import { HubAlreadyRunningError } from "../errors/custom-errors";
import {
  HUB_SOCKET_BASENAME,
  MAX_LINE_BYTES,
  parseFrame,
  udsAddress,
  type PeerControlFrame,
  type PeerUserFrame,
} from "./peer-protocol";

/** Events emitted by {@link HubInbox}. */
interface InboxEvents extends Record<string, unknown> {
  message: PeerUserFrame;
  control: PeerControlFrame;
}

/** Per-connection line buffer. */
interface ConnState {
  buf: string;
}

/** Resolve after `ms`. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True if something is accepting connections on `socketPath`. */
async function socketIsLive(socketPath: string): Promise<boolean> {
  const [err, sock] = await catchError(
    Promise.race([
      Bun.connect({ unix: socketPath, socket: { data() {} } }),
      delay(300).then(() => Promise.reject(new Error("timeout"))),
    ]),
  );
  if (err) return false;
  sock.end();
  return true;
}

/**
 * The hub's own messaging socket. Sessions reply here with their built-in
 * SendMessage (to the `from` address we stamp on every message), so replies
 * arrive without any polling.
 */
export class HubInbox extends TypedEmitter<InboxEvents> {
  readonly socketPath: string;
  /** The address sessions reply to. */
  readonly address: string;
  private listener: UnixSocketListener<ConnState> | undefined;

  constructor(socketDir: string) {
    super();
    this.socketPath = join(socketDir, HUB_SOCKET_BASENAME);
    this.address = udsAddress(this.socketPath);
  }

  /**
   * Bind the socket (0600 in a 0700 dir, like Claude Code's own).
   *
   * @throws HubAlreadyRunningError if another hub is live on the path.
   */
  async start(): Promise<void> {
    await mkdir(join(this.socketPath, ".."), { recursive: true, mode: 0o700 });
    if (await isSocket(this.socketPath)) {
      if (await socketIsLive(this.socketPath)) throw new HubAlreadyRunningError(this.socketPath, await runningServerPid());
      await unlink(this.socketPath);
    }

    this.listener = Bun.listen<ConnState>({
      unix: this.socketPath,
      socket: {
        open: (s) => {
          s.data = { buf: "" };
        },
        data: (s, chunk) => {
          s.data.buf += chunk.toString();
          if (s.data.buf.length > MAX_LINE_BYTES) {
            console.warn("[inbox] oversized line; dropping connection");
            s.end();
            return;
          }
          let nl: number;
          while ((nl = s.data.buf.indexOf("\n")) !== -1) {
            const line = s.data.buf.slice(0, nl);
            s.data.buf = s.data.buf.slice(nl + 1);
            this.handleLine(line);
          }
        },
        close: (s) => {
          // A sender may end without a trailing newline.
          if (s.data?.buf.trim()) this.handleLine(s.data.buf);
        },
        error: (_s, err) => console.warn(`[inbox] connection error: ${err.message}`),
      },
    });
    await chmod(this.socketPath, 0o600);
  }

  /** Close the listener and remove the socket file. */
  async stop(): Promise<void> {
    this.listener?.stop(true);
    this.listener = undefined;
    await catchError(unlink(this.socketPath));
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    const [err, raw] = catchSync((): unknown => JSON.parse(line));
    if (err) {
      console.warn(`[inbox] unparseable line: ${line.slice(0, 120)}`);
      return;
    }
    const frame = parseFrame(raw);
    if (frame.kind === "user") this.emit("message", frame);
    else if (frame.kind === "control") this.emit("control", frame);
  }
}
