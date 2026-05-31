/**
 * Parsing helpers for the "bare" message format used by the dashboard and CLI.
 *
 * A message is just natural-language text. Two optional, lightweight conventions
 * are recognised inside the body — nothing else is required from the sender:
 *
 *   1. A leading slash-command sets the message type:
 *        "/task implement the login screen"   → type "task"
 *      Only known types are honoured; an unknown "/foo …" is left untouched and
 *      the message stays the default type "message".
 *
 *   2. @mentions pick the recipients:
 *        "@bon @kai please sync"              → recipients ["bon", "kai"]
 *        "@group:crm ship it"                 → recipients ["group:crm"]
 *      With no mention the message is a channel broadcast (recipients: []).
 *
 * The mentions are intentionally KEPT in the payload text — agents read the
 * message naturally ("Hey @bon …"), and routing is driven by the same tokens.
 */

/** Message types that a leading `/word` may set. */
export const MESSAGE_TYPES = [
  "message",
  "task",
  "result",
  "question",
  "answer",
  "command",
  "context",
  "status",
  "note",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

const TYPE_SET = new Set<string>(MESSAGE_TYPES);

/** Result of {@link parseBody}. */
export interface ParsedBody {
  /** Resolved message type (defaults to "message"). */
  type: MessageType;
  /** Full text of the message, mentions preserved, slash-command stripped. */
  text: string;
  /**
   * Recipient tokens parsed from @mentions. A plain `@bon` yields `"bon"`;
   * a `@group:crm` yields `"group:crm"`. Empty array means broadcast.
   */
  recipients: string[];
}

/**
 * Parse a raw message body into a type, cleaned text, and recipient tokens.
 *
 * @param raw - The message body exactly as typed by the sender.
 * @returns The resolved {@link ParsedBody}.
 *
 * @example
 * parseBody("/task @bon @group:crm wire up auth")
 * // → { type: "task", text: "@bon @group:crm wire up auth", recipients: ["bon", "group:crm"] }
 */
export function parseBody(raw: string): ParsedBody {
  let text = raw.trim();
  let type: MessageType = "message";

  // Leading slash-command → message type (only if it's a known type).
  const slash = text.match(/^\/([a-zA-Z]+)\s*/);
  if (slash && slash[1] && TYPE_SET.has(slash[1].toLowerCase())) {
    type = slash[1].toLowerCase() as MessageType;
    text = text.slice(slash[0].length).trim();
  }

  // @mentions → recipient tokens. Allows @alias and @group:name.
  const mentions = [...text.matchAll(/@([\w-]+(?::[\w-]+)?)/g)].map((m) => m[1] ?? "");
  const recipients = [...new Set(mentions.filter(Boolean))];

  return { type, text, recipients };
}

/** Strip a single leading "@" from a token, if present (`"@bon"` → `"bon"`). */
export function stripAt(token: string): string {
  return token.startsWith("@") ? token.slice(1) : token;
}
