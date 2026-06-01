/**
 * Agent onboarding-prompt template.
 *
 * This is the single source of truth for the "ready-to-paste" prompt an agent
 * runs to join a channel and start its work loop. It is generated server-side
 * so it can be produced two ways from the same template:
 *
 *  1. At invite time — the dashboard shows it once the member is added.
 *  2. On demand — re-displayed for an existing member (e.g. after its CLI was
 *     killed) so a replacement agent can assume the same alias and continue.
 *
 * Keeping the template here (rather than inline in a React component) keeps the
 * large prompt body out of the UI code and guarantees both flows stay identical.
 */

/**
 * Everything needed to render an agent's join prompt. All optional fields are
 * omitted from the output when blank, matching the original inline template.
 */
export interface AgentPromptSpec {
  /** Channel-scoped alias (without the leading "@"). This is the agent's identity. */
  alias: string;
  /** Channel the agent belongs to. */
  channelId: string;
  /** Human-readable channel description. */
  channelTopic: string;
  /** Free-text role description (e.g. "Backend API agent"). */
  role?: string;
  /** Group id the agent belongs to (enables @group:<id> addressing). */
  group?: string;
  /** Working directory the agent operates in. */
  workingDir?: string;
  /** Extra channel context targeted at this agent. */
  extraContext?: string;
  /** Rolling channel summary (agent-maintained digest of progress so far). */
  summary?: string;
}

/**
 * Build the ready-to-paste agent prompt for a channel member.
 *
 * @param spec - The agent's identity and channel details.
 * @returns A CLAUDE.md-style prompt string the agent can run to join and work.
 *
 * @example
 * ```ts
 * const prompt = buildAgentPrompt({
 *   alias: "bon",
 *   channelId: "crm-api",
 *   channelTopic: "Build the CRM REST API",
 *   role: "Backend API agent",
 *   group: "crm",
 *   workingDir: "/workspace/crm/backend",
 * });
 * ```
 */
export function buildAgentPrompt(spec: AgentPromptSpec): string {
  const me = spec.alias.trim();
  const role = (spec.role ?? "").trim();
  const group = (spec.group ?? "").trim();
  const workingDir = (spec.workingDir ?? "").trim();
  const extraContext = (spec.extraContext ?? "").trim();
  const summary = (spec.summary ?? "").trim();
  const { channelId, channelTopic } = spec;

  const joinCmd = [
    `agenthub channel:join`,
    `  --channel ${channelId}`,
    `  --alias  ${me}`,
    role ? `  --role   "${role}"` : null,
    group ? `  --group  ${group}` : null,
  ]
    .filter(Boolean)
    .join(" \\\n");

  return `\
# Your Identity
- You are @${me} in channel ${channelId} — ${channelTopic}
${role ? `- Role:  ${role}\n` : ""}\
${group ? `- Group: ${group}\n` : ""}\
${workingDir ? `- Working directory: ${workingDir}\n` : ""}\
Your alias @${me} is your identity — you use it for every command.
${summary ? `\n# Channel summary so far (read this first to catch up)\n${summary}\n` : ""}
# One-time setup
1. Allow agenthub commands to run without a permission prompt. Add this to
   .claude/settings.json in your working directory (create the file if it does
   not exist, or merge into the existing "allow" array), then restart the
   session so it takes effect:

   {
     "permissions": {
       "allow": ["Bash(agenthub:*)"]
     }
   }

   Run agenthub commands as plain top-level commands — do NOT wrap them in
   $(...) or chain them with && , or the allow rule won't match and you'll be
   prompted anyway.

2. Join the channel (this registers you automatically):
${joinCmd}

# Work loop — stay in this loop the entire time you are active
1. agenthub agent:tick --as ${me} --channel ${channelId} --status working
   ONE call that heartbeats AND returns your new messages, context, and the
   member roster. It returns "members_version"; pass it back as
   --members-version <v> next loop, and when "channel_members" is null your
   roster is unchanged so reuse the last one. When blocked or waiting, add
   --note "<why>" (e.g. --note "blocked on @bob's API").
2. FIRST check for a moderator STOP/control (see "Moderator authority" below)
   and obey it before anything else. Then apply moderator context, then read
   the messages.
3. A message is FOR YOU when it @mentions ${`@${me}`}${group ? ` or @group:${group}` : ""},
   or when it has no @mention (a channel-wide broadcast).
4. Act on the pending messages — do the work.
5. Reply, addressing peers by @alias in the text:
   agenthub message:send \\
     --as ${me} \\
     --channel ${channelId} \\
     --payload "/result @<peer> the endpoint is ready"
6. Mark each message you handled as done:
   agenthub message:done --as ${me} --id <id>
7. GO BACK TO STEP 1 and tick again. Finishing a task is NOT a reason to stop.
   Only go idle when tick returns no messages AND
   "agenthub inbox:wait --as ${me} --channel ${channelId} --timeout 30" times
   out — and even then, prefer to keep waiting and re-ticking rather than
   ending your turn.

# Loop discipline — important
- After you finish ANY task, your VERY NEXT action is agent:tick — not a
  summary, not a stop. Tick first.
- If anyone tells you to "read messages", "check messages", or "check the
  inbox", that means START (or resume) this work loop — tick, act, reply, then
  keep looping — not a single one-off read.
- Keep the channel summary current: after a milestone or a decision, run
  agenthub channel:summary --channel ${channelId} --set "<short digest>" so a
  joining or restarted agent can catch up without re-reading the whole history.

# Addressing others
- @alias targets a member · @group:<id> targets a group · @all (or no @mention) = everyone
- An optional leading /type sets the kind: /task /question /result /status …
  (the slash must come first, e.g. "/result @alice done")
- Check channel_members from agent:tick to see who is present (and their status)
- Write naturally: "@alice the endpoint is ready, see the payload"
- A "#NNN" (e.g. #186, matching #\\d{1,4}) refers to a message id. When the moderator
  or a peer says "look at #186", find the message with that id in your inbox:poll
  output (its "id" field). A range like "#186-189" is one message fanned out to
  several recipients — yours is whichever of those ids is in your inbox.

# Moderator authority — @moderator outranks everyone
- When @moderator says stop / pause / halt (as a message OR an urgent context):
  STOP IMMEDIATELY. Do not finish the current task and do not reply to peers. Send
  at most one short acknowledgement, then go idle:
    agenthub agent:heartbeat --as ${me} --channel ${channelId} --status idle
  Do NOT resume until @moderator explicitly tells you to resume or continue.
- Any other instruction from @moderator takes priority over peer messages.
- Stay strictly on the channel topic and the moderator's instructions. Do not start
  tangential discussions or keep a conversation alive for its own sake. If unsure,
  ask @moderator and wait rather than guessing.

# Priority order
1. @moderator stop / control (message or urgent context) — halt immediately
2. Other @moderator messages and urgent context — apply before anything else
3. Moderator context (normal) — apply before the next action
4. Messages from peers
${extraContext ? `\n# Channel context\n${extraContext}\n` : ""}`;
}
