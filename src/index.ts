#!/usr/bin/env bun
import { parseCli, printUsage, type CliResult } from "./cli-parser";
import { catchError } from "./lib/error-handler";
import { NAME, VERSION } from "./version";
import { fail } from "./commands/output";
import { runLs, runSend } from "./commands/sessions";
import { runSpawn } from "./commands/spawn";
import { runRoomAdd, runRoomCreate, runRoomPost, runRooms } from "./commands/rooms";

/** Route a parsed command to its handler. */
async function dispatch(cli: CliResult): Promise<void> {
  switch (cli.type) {
    case "help":
      return printUsage();
    case "version":
      return console.log(`${NAME} ${VERSION}`);
    case "server": {
      const { startServer } = await import("./server");
      return startServer({ port: cli.port });
    }
    case "tui": {
      const { runTui } = await import("./tui");
      return runTui();
    }
    case "ls":
      return runLs(cli.json);
    case "send":
      return runSend(cli.session, cli.body);
    case "spawn": {
      const { type: _, ...req } = cli;
      return runSpawn(req);
    }
    case "rooms":
      return runRooms();
    case "room:create":
      return runRoomCreate({ name: cli.name, topic: cli.topic, context: cli.context });
    case "room:add":
      return runRoomAdd(cli.roomId, cli.session, cli.alias);
    case "room:post":
      return runRoomPost(cli.roomId, cli.body);
  }
}

// Typed hub errors and argv errors (parseArgs throws TypeError) both end as `{ ok: false, error }`.
const [err] = await catchError((async () => dispatch(parseCli()))());
if (err) fail(err.message);
