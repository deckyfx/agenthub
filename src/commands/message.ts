import { MessageStore } from "../stores/message-store";
import { ChannelStore } from "../stores/channel-store";
import { AliasNotFoundError } from "../errors/custom-errors";
import type { MessageType } from "../stores/message-store";

/**
 * message:send — Send a message to a channel.
 *
 * Supports @alias notation for --from and --to. If the value starts with '@',
 * the alias is resolved to an agent ID within the given channel.
 */
export async function runMessageSend(opts: {
  from: string;
  channelId: string;
  to?: string;
  type: MessageType;
  payload: string;
}): Promise<void> {
  const { channelId } = opts;

  let fromAgent = opts.from;
  let fromAlias: string | undefined;
  let toAgent: string | undefined = opts.to;
  let toAlias: string | undefined;

  // Resolve @alias for sender
  if (opts.from.startsWith("@")) {
    const alias = opts.from.slice(1);
    fromAgent = await ChannelStore.resolveAlias(alias, channelId);
    fromAlias = alias;
  } else {
    // Look up sender's alias in this channel if subscribed
    const sub = await ChannelStore.getSubscription(fromAgent, channelId);
    fromAlias = sub?.alias;
  }

  // Resolve @alias for recipient
  if (opts.to?.startsWith("@")) {
    const alias = opts.to.slice(1);
    toAgent = await ChannelStore.resolveAlias(alias, channelId);
    toAlias = alias;
  } else if (opts.to) {
    // Look up recipient's alias in this channel
    const sub = await ChannelStore.getSubscription(opts.to, channelId);
    toAlias = sub?.alias;
  }

  const msg = await MessageStore.send({
    channel_id: channelId,
    from_agent: fromAgent,
    from_alias: fromAlias,
    to_agent: toAgent,
    to_alias: toAlias ?? (opts.to ? undefined : "all"),
    type: opts.type,
    payload: opts.payload,
  });

  console.log(JSON.stringify({ ok: true, message: msg }));
}

/** message:done — Mark a message as done by the handling agent */
export async function runMessageDone(
  messageId: number,
  agentId: string,
): Promise<void> {
  await MessageStore.markDone(messageId);
  console.log(JSON.stringify({ ok: true }));
}
