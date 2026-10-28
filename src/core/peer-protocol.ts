/**
 * Claude Code cross-session ("peer") messaging protocol — wire format only.
 *
 * This is the ONLY module that knows Claude Code's internal socket protocol.
 * It is undocumented and was derived from Claude Code 2.1.31x
 * (`peerProtocol: 1` in `~/.claude/sessions/<pid>.json`), so keep every
 * protocol detail here and gate on {@link SUPPORTED_PEER_PROTOCOL}.
 *
 * Transport: one Unix-socket connection per message, newline-delimited JSON.
 *   1. optional auth line   {"type":"auth","token":"<peerToken>"}
 *   2. one frame line       {"type":"user"|"control", …}
 *
 * A `user` frame's content is wrapped in a `<cross-session-message …>`
 * envelope. The receiver re-renders it for its model and replies (with its
 * SendMessage tool) to the envelope's `from` address — a `uds:<socket path>`
 * string. Claude Code only accepts a reply target that is a `.sock` file in
 * the same directory as its own socket, or (across default socket dirs) one
 * whose basename is `<digits>.sock` or `<1-16 hex>.sock`.
 */

/** The `peerProtocol` value this module speaks. */
export const SUPPORTED_PEER_PROTOCOL = 1;

/** Frame schema version Claude Code stamps on sends (`msgV`). */
const MSG_VERSION = 1;

/** Envelope tag Claude Code wraps cross-session content in. */
const ENVELOPE_TAG = "cross-session-message";

/** Hard cap on one inbound line; Claude Code drops oversized connections too. */
export const MAX_LINE_BYTES = 1_000_000;

/** Delivery urgency. `next` = queue for the receiver's next turn (Claude Code's default). */
export type PeerPriority = "now" | "next" | "later";

/** Sender permission mode Claude Code advertises in the envelope. */
export type PeerFromMode = "bypass" | "prompting";

/** Parsed `<cross-session-message>` envelope. */
export interface PeerEnvelope {
  /** Reply address, e.g. `uds:/tmp/cc-socks/123.sock`. */
  from?: string;
  /** Sender's session name as shown in ListAgents. */
  fromName?: string;
  fromSession?: string;
  fromMode?: PeerFromMode;
  fromPlugin?: string;
  /** Hop chain ids (loop detection across relays). */
  hopChain?: string[];
  body: string;
}

/** An inbound `user` frame (a message from a session). */
export interface PeerUserFrame {
  kind: "user";
  msgId?: string;
  /** Transport-level reply address. */
  from?: string;
  priority?: string;
  /** The parsed envelope, or a bare body when the content was not enveloped. */
  envelope: PeerEnvelope;
}

/** An inbound `control` frame (rename, delivery status, idle notices …). */
export interface PeerControlFrame {
  kind: "control";
  action: string;
  raw: Record<string, unknown>;
}

/** Anything a hub socket can receive on one line. */
export type PeerInboundFrame =
  | PeerUserFrame
  | PeerControlFrame
  | { kind: "auth" }
  | { kind: "unknown"; raw: unknown };

/** Characters Claude Code leaves unescaped in a `uds:` address. */
const ADDRESS_SAFE = /[^A-Za-z0-9:_/.\\-]/gu;

/**
 * Encode a socket path as a peer address (`uds:` + percent-encoded path),
 * byte-for-byte the way Claude Code does.
 */
export function udsAddress(socketPath: string): string {
  const encoder = new TextEncoder();
  const encoded = socketPath.replace(ADDRESS_SAFE, (ch) =>
    Array.from(encoder.encode(ch), (b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join(""),
  );
  return `uds:${encoded}`;
}

/** Decode a `uds:` address back to a socket path. Returns undefined for other schemes. */
export function socketPathFromAddress(address: string): string | undefined {
  if (!address.startsWith("uds:")) return undefined;
  const rest = address.slice(4);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** Strip characters the envelope's quoted attributes cannot carry. */
function attr(value: string): string {
  return value.replace(/["<>\r\n]/g, "").trim();
}

/**
 * Neutralise anything in the body that would close the envelope early
 * (Claude Code escapes `</cross-session-message` as `<\/…`).
 */
function escapeBody(body: string): string {
  return body.replace(new RegExp(`<(?=/${ENVELOPE_TAG})`, "giu"), "<\\");
}

/**
 * Wrap a body in the `<cross-session-message>` envelope. Attribute order
 * matters: Claude Code's parser matches them positionally.
 */
export function buildEnvelope(e: { from: string; fromName?: string; body: string }): string {
  const attrs = [`from="${attr(e.from)}"`];
  const name = e.fromName ? attr(e.fromName) : "";
  if (name) attrs.push(`from-name="${name}"`);
  return `<${ENVELOPE_TAG} ${attrs.join(" ")}>\n${escapeBody(e.body)}\n</${ENVELOPE_TAG}>`;
}

/** The auth line a sender may present before its frame. */
export function buildAuthLine(token: string): string {
  return `${JSON.stringify({ type: "auth", token })}\n`;
}

/**
 * Build the line for a `user` frame — what a Claude Code SendMessage writes.
 *
 * @returns the serialized line and the frame's `msg_id`.
 */
export function buildUserFrame(opts: {
  /** Our reply address (`uds:` …). */
  from: string;
  fromName?: string;
  body: string;
  priority?: PeerPriority;
}): { line: string; msgId: string } {
  const msgId = crypto.randomUUID();
  const frame = {
    msgV: MSG_VERSION,
    msg_id: msgId,
    type: "user",
    message: { role: "user", content: buildEnvelope(opts) },
    priority: opts.priority ?? "next",
    from: opts.from,
  };
  return { line: `${JSON.stringify(frame)}\n`, msgId };
}

/** Attribute matcher inside the envelope's opening tag. */
const ATTR_RE = /([a-z-]+)="([^"]*)"/g;
const ENVELOPE_RE = new RegExp(`^<${ENVELOPE_TAG}((?: [a-z-]+="[^"]*")*)>\\n([\\s\\S]*)\\n</${ENVELOPE_TAG}>$`);

/** Parse a `<cross-session-message>` envelope. Non-enveloped content becomes a bare body. */
export function parseEnvelope(content: string): PeerEnvelope {
  const m = ENVELOPE_RE.exec(content.trim());
  if (!m) return { body: content };
  const env: PeerEnvelope = { body: m[2] ?? "" };
  for (const [, key, value] of (m[1] ?? "").matchAll(ATTR_RE)) {
    if (value === undefined) continue;
    switch (key) {
      case "from": env.from = value; break;
      case "from-name": env.fromName = value; break;
      case "from-session": env.fromSession = value; break;
      case "from-plugin": env.fromPlugin = value; break;
      case "hop-chain": env.hopChain = value.split(","); break;
      case "from-mode":
        if (value === "bypass" || value === "prompting") env.fromMode = value;
        break;
    }
  }
  return env;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Classify one decoded JSON line received on the hub socket. */
export function parseFrame(raw: unknown): PeerInboundFrame {
  if (!isRecord(raw) || typeof raw.type !== "string") return { kind: "unknown", raw };
  if (raw.type === "auth") return { kind: "auth" };
  if (raw.type === "control") {
    return { kind: "control", action: typeof raw.action === "string" ? raw.action : "", raw };
  }
  if (raw.type === "user") {
    const message = isRecord(raw.message) ? raw.message : undefined;
    const content = typeof message?.content === "string" ? message.content : "";
    return {
      kind: "user",
      msgId: typeof raw.msg_id === "string" ? raw.msg_id : undefined,
      from: typeof raw.from === "string" ? raw.from : undefined,
      priority: typeof raw.priority === "string" ? raw.priority : undefined,
      envelope: parseEnvelope(content),
    };
  }
  return { kind: "unknown", raw };
}

/**
 * Hub socket basename. Hex-only on purpose: Claude Code accepts a reply
 * target outside its own socket dir only if the basename is digits or 1–16
 * hex chars, so this stays a valid address for sessions in any default dir.
 */
export const HUB_SOCKET_BASENAME = "a9e47b0b.sock";
