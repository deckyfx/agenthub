import { parseCli, printUsage } from "./cli-parser";
import { runServer } from "./commands/server";
import { runInit } from "./commands/init";
import { runAgentRegister, runAgentHeartbeat } from "./commands/agent";
import { runGroupCreate, runGroupAdd, runGroupMembers } from "./commands/group";
import { runChannelCreate, runChannelJoin, runChannelLeave, runChannelList, runChannelMembers } from "./commands/channel";
import { runInboxPoll, runInboxWait } from "./commands/inbox";
import { runMessageSend, runMessageDone } from "./commands/message";
import { runContextInject, runContextApplied } from "./commands/context";
import { catchError } from "./lib/error-handler";

async function main(): Promise<void> {
  const result = parseCli();

  if (result.type === "help") {
    printUsage();
    process.exit(0);
  }

  if (result.type === "error") {
    console.error(JSON.stringify({ ok: false, error: result.message }));
    process.exit(1);
  }

  const [err] = await catchError(dispatch(result));

  if (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}

/** Route a parsed CLI result to the appropriate command handler */
async function dispatch(result: Exclude<ReturnType<typeof parseCli>, { type: "help" | "error" }>): Promise<void> {
  switch (result.type) {
    case "server":
      return runServer(result.port);

    case "init":
      return runInit(result.dbPath);

    case "agent:register":
      return runAgentRegister(result.id, result.dir, result.name);

    case "agent:heartbeat":
      return runAgentHeartbeat(result.id, result.status);

    case "group:create":
      return runGroupCreate(result.id, result.name, result.description);

    case "group:add":
      return runGroupAdd(result.group, result.agent);

    case "group:members":
      return runGroupMembers(result.group);

    case "channel:create":
      return runChannelCreate(result.id, result.topic, result.by);

    case "channel:join":
      return runChannelJoin(result.agent, result.channel, result.alias, result.role, result.group);

    case "channel:leave":
      return runChannelLeave(result.agent, result.channel);

    case "channel:list":
      return runChannelList(result.agent);

    case "channel:members":
      return runChannelMembers(result.channel);

    case "inbox:poll":
      return runInboxPoll(result.agent);

    case "inbox:wait":
      return runInboxWait(result.agent, result.timeout);

    case "message:send":
      return runMessageSend({
        from: result.from,
        channelId: result.channel,
        to: result.to,
        type: result.msgType,
        payload: result.payload,
      });

    case "message:done":
      return runMessageDone(result.id, result.agent);

    case "context:inject":
      return runContextInject({
        content: result.content,
        channelId: result.channel,
        to: result.to,
        toGroup: result.toGroup,
        priority: result.priority,
      });

    case "context:applied":
      return runContextApplied(result.id, result.agent);
  }
}

main();
