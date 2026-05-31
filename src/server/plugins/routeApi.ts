import { Elysia, t } from "elysia";
import { AgentStore } from "../../stores/agent-store";
import { ChannelStore } from "../../stores/channel-store";
import { GroupStore } from "../../stores/group-store";
import { MessageStore } from "../../stores/message-store";
import { ContextStore } from "../../stores/context-store";
import { sendMessage } from "../../commands/message";
import type { AgentStatus } from "../../stores/agent-store";

/**
 * All hub data exposed as a REST API.
 * The React dashboard consumes this via Eden Treaty.
 */
export const apiPlugin = new Elysia({ prefix: "/api" })

  // ── Agents ────────────────────────────────────────────────────────────────

  .get("/agents", async () => {
    const agents = await AgentStore.findAll();
    return { ok: true, agents };
  })

  .get("/agents/:id", async ({ params }) => {
    const agent = await AgentStore.findById(params.id);
    if (!agent) return { ok: false, error: "Agent not found" };
    return { ok: true, agent };
  })

  .patch(
    "/agents/:id/status",
    async ({ params, body }) => {
      await AgentStore.setStatus(params.id, body.status as AgentStatus);
      return { ok: true };
    },
    { body: t.Object({ status: t.String() }) },
  )

  // ── Groups ────────────────────────────────────────────────────────────────

  .get("/groups", async () => {
    const groups = await GroupStore.findAll();
    return { ok: true, groups };
  })

  .post(
    "/groups",
    async ({ body }) => {
      const group = await GroupStore.create({
        id: body.id,
        display_name: body.display_name,
        description: body.description ?? null,
      });
      return { ok: true, group };
    },
    {
      body: t.Object({
        id: t.String(),
        display_name: t.String(),
        description: t.Optional(t.String()),
      }),
    },
  )

  .get("/groups/:id/members", async ({ params }) => {
    const members = await GroupStore.getMembers(params.id);
    return { ok: true, members };
  })

  .post(
    "/groups/:id/members",
    async ({ params, body }) => {
      await GroupStore.addMember(params.id, body.agent_id);
      return { ok: true };
    },
    { body: t.Object({ agent_id: t.String() }) },
  )

  // ── Channels ──────────────────────────────────────────────────────────────

  .get("/channels", async () => {
    const channels = await ChannelStore.findAllActive();
    return { ok: true, channels };
  })

  .post(
    "/channels",
    async ({ body }) => {
      const channel = await ChannelStore.create({
        id: body.id,
        topic: body.topic,
        created_by: body.created_by ?? "moderator",
      });
      return { ok: true, channel };
    },
    {
      body: t.Object({
        id: t.String(),
        topic: t.String(),
        created_by: t.Optional(t.String()),
      }),
    },
  )

  .get("/channels/:id", async ({ params }) => {
    const channel = await ChannelStore.findById(params.id);
    if (!channel) return { ok: false, error: "Channel not found" };
    return { ok: true, channel };
  })

  .get("/channels/:id/messages", async ({ params }) => {
    // Loading the feed is the moderator "reading" the channel: acknowledge
    // messages addressed to it (and undelivered broadcast rows) so they don't
    // sit at "pending" forever — the dashboard sends as "moderator".
    await MessageStore.markChannelReadForObserver(params.id, "moderator");
    const messages = await MessageStore.findByChannel(params.id);
    return { ok: true, messages };
  })

  .get("/channels/:id/members", async ({ params }) => {
    const members = await ChannelStore.getMembers(params.id);
    return { ok: true, members };
  })

  .post(
    "/channels/:id/members",
    async ({ params, body }) => {
      // Identity is the alias: agent_id is optional and defaults to it.
      const id = (body.agent_id?.trim() || body.alias).trim();

      // Auto-register so inviting is the only step needed.
      await AgentStore.upsert({
        id,
        display_name: id,
        working_dir: "",
        status: "idle",
      });

      // Auto-upsert group and membership when group_id is provided
      if (body.group_id) {
        await GroupStore.upsert({ id: body.group_id, display_name: body.group_id });
        await GroupStore.addMember(body.group_id, id);
      }

      const subscription = await ChannelStore.join(
        id,
        params.id,
        body.alias,
        body.role_description ?? undefined,
      );
      return { ok: true, subscription };
    },
    {
      body: t.Object({
        agent_id: t.Optional(t.String()),
        alias: t.String(),
        role_description: t.Optional(t.String()),
        group_id: t.Optional(t.String()),
      }),
    },
  )

  .delete("/channels/:id/members/:agentId", async ({ params }) => {
    await ChannelStore.leave(params.agentId, params.id);
    return { ok: true };
  })

  .patch("/channels/:id/archive", async ({ params }) => {
    await ChannelStore.archive(params.id);
    return { ok: true };
  })

  // ── Messages ──────────────────────────────────────────────────────────────

  .post(
    "/messages",
    async ({ body }) => {
      // Bare send: recipients + type are parsed from the body text. Dashboard
      // messages are from "moderator" unless an explicit sender is given.
      const messages = await sendMessage({
        from: body.from,
        channelId: body.channel_id,
        body: body.body,
      });
      return { ok: true, sent_count: messages.length, messages };
    },
    {
      body: t.Object({
        channel_id: t.String(),
        body: t.String(),
        from: t.Optional(t.String()),
      }),
    },
  )

  // ── Context ───────────────────────────────────────────────────────────────

  .get("/context", async () => {
    const context = await ContextStore.findAll();
    return { ok: true, context };
  })

  .post(
    "/context",
    async ({ body }) => {
      const context = await ContextStore.inject({
        channel_id: body.channel_id ?? undefined,
        target_agent: body.target_agent,
        content: body.content,
        priority: (body.priority as "normal" | "urgent") ?? "normal",
        injected_by: "moderator",
      });
      return { ok: true, context };
    },
    {
      body: t.Object({
        channel_id: t.Optional(t.String()),
        target_agent: t.String(),
        content: t.String(),
        priority: t.Optional(t.String()),
      }),
    },
  )

  .get("/health", () => ({ ok: true, status: "online" }));
