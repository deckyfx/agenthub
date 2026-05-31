import { ContextStore } from "../stores/context-store";
import { GroupStore } from "../stores/group-store";

/**
 * context:inject — Inject free-form context targeting an agent, alias, group, or 'all'.
 *
 * Target resolution:
 * - --to <agentId>        → target_agent = agentId
 * - --to @alias           → target_agent = @alias (resolved at poll time)
 * - --to-group <groupId>  → target_agent = group:<groupId>
 * - (neither)             → target_agent = 'all'
 */
export async function runContextInject(opts: {
  content: string;
  channelId?: string;
  to?: string;
  toGroup?: string;
  priority?: "normal" | "urgent";
}): Promise<void> {
  let targetAgent = "all";

  if (opts.to) {
    targetAgent = opts.to; // could be agentId or @alias
  } else if (opts.toGroup) {
    targetAgent = `group:${opts.toGroup}`;
  }

  const ctx = await ContextStore.inject({
    channel_id: opts.channelId,
    target_agent: targetAgent,
    content: opts.content,
    priority: opts.priority ?? "normal",
    injected_by: "moderator",
  });

  console.log(JSON.stringify({ ok: true, context: ctx }));
}

/** context:applied — Mark a context injection as applied by an agent */
export async function runContextApplied(
  contextId: number,
  agentId: string,
): Promise<void> {
  await ContextStore.markApplied(contextId, agentId);
  console.log(JSON.stringify({ ok: true }));
}
