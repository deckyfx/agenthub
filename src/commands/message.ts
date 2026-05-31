import { MessageStore } from "../stores/message-store";
import { ChannelStore } from "../stores/channel-store";
import { GroupStore } from "../stores/group-store";
import { parseBody, stripAt, type MessageType } from "../lib/message-parse";
import type { Message } from "../db/schema";

/** Options for {@link sendMessage}. */
export interface SendMessageOptions {
  /** Sender alias. Defaults to "moderator" (dashboard messages). */
  from?: string;
  /** Target channel id. */
  channelId: string;
  /** Raw message body — may contain a leading /type and @mentions. */
  body: string;
  /** Explicit type override; otherwise inferred from a leading slash-command. */
  type?: MessageType;
  /**
   * Explicit recipient override (alias or `group:<name>`); otherwise recipients
   * are taken from @mentions in the body. Use to address a peer from a JSON
   * payload that has no @mention.
   */
  to?: string;
}

/**
 * Core send routine shared by the CLI and the dashboard API.
 *
 * The sender is always known (moderator or an agent alias); recipients and type
 * come from the body via {@link parseBody}, unless overridden.
 *
 * Recipients are resolved to concrete channel aliases and one row is written per
 * recipient, so every agent owns its own copy with its own read state. This is
 * what makes broadcasts and group messages reach *every* member rather than
 * being consumed by whoever polls first.
 *
 * @returns The message rows that were created (one per delivered recipient).
 */
export async function sendMessage(opts: SendMessageOptions): Promise<Message[]> {
  const fromAlias = stripAt(opts.from?.trim() || "moderator");
  const parsed = parseBody(opts.body);
  const type: MessageType = opts.type ?? parsed.type;

  // An explicit `--to` is trusted (it may address an agent who has not joined
  // yet). Mentions parsed from the body are NOT trusted: only those resolving to
  // a real channel member or group become recipients, so stray @tokens in prose
  // (e.g. writing "@mention parsing" in a sentence) can't fan out phantom rows.
  const explicit = opts.to ? stripAt(opts.to.trim()) : null;
  const tokens = explicit ? [explicit] : parsed.recipients;
  const recipients = await resolveRecipients(
    opts.channelId,
    fromAlias,
    tokens,
    explicit !== null,
  );

  const base = {
    channel_id: opts.channelId,
    from_agent: fromAlias, // kept for the NOT NULL column; identity is the alias
    from_alias: fromAlias,
    type,
    payload: parsed.text,
  };

  // Nothing to deliver (e.g. a broadcast with no other members yet) — still
  // record one row so the message is visible in the channel feed.
  if (recipients.length === 0) {
    const msg = await MessageStore.send({ ...base, to_alias: undefined });
    return [msg];
  }

  const sent: Message[] = [];
  for (const alias of recipients) {
    sent.push(await MessageStore.send({ ...base, to_alias: alias }));
  }
  return sent;
}

/**
 * Expand recipient tokens into the concrete set of channel-member aliases that
 * should each receive a copy.
 *
 *   - no token         → every channel member except the sender (broadcast)
 *   - "<alias>"        → that alias (trusted: delivered even if not a member;
 *                        untrusted: only when it is a real channel member)
 *   - "group:<name>"   → group members who are also in this channel
 *
 * @param channelId - Channel the message belongs to.
 * @param fromAlias - Sender alias (excluded from broadcasts).
 * @param tokens - Recipient tokens parsed from the body, or an explicit override.
 * @param trusted - Whether the tokens came from an explicit `--to` override. When
 *   false (mentions parsed from prose), unknown plain aliases are dropped so that
 *   incidental @tokens in natural text don't create phantom recipients.
 */
async function resolveRecipients(
  channelId: string,
  fromAlias: string,
  tokens: string[],
  trusted: boolean,
): Promise<string[]> {
  const members = await ChannelStore.getMembers(channelId);
  const memberAliases = members.map((m) => m.alias);
  const memberSet = new Set(memberAliases);
  // agent_id → channel alias (handles the rare case where they differ).
  const aliasByAgentId = new Map(members.map((m) => [m.agent_id, m.alias]));

  // Broadcast: everyone in the channel except the sender.
  if (tokens.length === 0) {
    return memberAliases.filter((a) => a !== fromAlias);
  }

  const out = new Set<string>();
  for (const token of tokens) {
    if (token.startsWith("group:")) {
      const groupId = token.slice("group:".length);
      // A bare "group:" with no id (e.g. the prose "@group: foo") is not a real
      // target — skip it rather than expanding an empty group.
      if (!groupId) continue;
      const memberIds = await GroupStore.getMemberIds(groupId);
      for (const agentId of memberIds) {
        const alias = aliasByAgentId.get(agentId);
        if (alias && alias !== fromAlias) out.add(alias);
      }
    } else if (token !== fromAlias && (trusted || memberSet.has(token))) {
      out.add(token);
    }
  }
  return [...out];
}

/**
 * message:send — CLI entry point. Sends a message to a channel.
 *
 * @example
 *   agenthub message:send --from @bon --channel ch-auth \
 *     --payload "@kai login endpoint is ready, see /task"
 */
export async function runMessageSend(opts: {
  from?: string;
  channelId: string;
  to?: string;
  type?: MessageType;
  payload: string;
}): Promise<void> {
  const sent = await sendMessage({
    from: opts.from,
    channelId: opts.channelId,
    body: opts.payload,
    type: opts.type,
    to: opts.to,
  });
  console.log(JSON.stringify({ ok: true, sent_count: sent.length, messages: sent }));
}

/** message:done — Mark a message as done by the handling agent. */
export async function runMessageDone(
  messageId: number,
  _agentId: string,
): Promise<void> {
  await MessageStore.markDone(messageId);
  console.log(JSON.stringify({ ok: true }));
}
