/**
 * End-to-end relay test with two fake Claude Code sessions: real Unix
 * sockets and real registry files in an isolated temp dir, live pids.
 * Never touches the user's real ~/.claude or /tmp/cc-socks.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess, UnixSocketListener } from "bun";

import { TEST_ROOT } from "../test-setup";

const SESSIONS = join(TEST_ROOT, "claude", "sessions");
const SOCKS = join(TEST_ROOT, "socks");

const { runMigrations } = await import("../db/migrate");
const { Hub } = await import("./hub");
const { buildUserFrame, parseFrame, udsAddress } = await import("./peer-protocol");
type Hub = InstanceType<typeof Hub>;

/** A fake session: registry file + socket that records what it receives. */
interface FakeSession {
  pid: number;
  sessionId: string;
  socketPath: string;
  inbox: Array<{ body: string; fromName?: string; from?: string }>;
  listener: UnixSocketListener<{ buf: string }>;
}

async function fakeSession(name: string, pid: number, project: string): Promise<FakeSession> {
  const socketPath = join(SOCKS, `${pid}.sock`);
  const inbox: FakeSession["inbox"] = [];
  const listener = Bun.listen<{ buf: string }>({
    unix: socketPath,
    socket: {
      open: (s) => void (s.data = { buf: "" }),
      data: (s, chunk) => {
        s.data.buf += chunk.toString();
        let nl: number;
        while ((nl = s.data.buf.indexOf("\n")) !== -1) {
          const frame = parseFrame(JSON.parse(s.data.buf.slice(0, nl)));
          s.data.buf = s.data.buf.slice(nl + 1);
          if (frame.kind === "user") inbox.push({ body: frame.envelope.body, fromName: frame.envelope.fromName, from: frame.envelope.from });
        }
      },
    },
  });
  const sessionId = crypto.randomUUID();
  await Bun.write(
    join(SESSIONS, `${pid}.json`),
    JSON.stringify({
      pid,
      sessionId,
      cwd: `/work/${project}`,
      startedAt: Date.now(),
      version: "2.1.312",
      peerProtocol: 1,
      kind: "interactive",
      entrypoint: "cli",
      messagingSocketPath: socketPath,
      name,
      status: "idle",
      statusUpdatedAt: Date.now(),
    }),
  );
  return { pid, sessionId, socketPath, inbox, listener };
}

/** Reply to the hub the way a Claude session's SendMessage would. */
async function reply(from: FakeSession, hubSocket: string, body: string): Promise<void> {
  const { line } = buildUserFrame({ from: udsAddress(from.socketPath), fromName: "fake", body });
  const sock = await Bun.connect({ unix: hubSocket, socket: { data() {} } });
  sock.write(line);
  sock.end();
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await Bun.sleep(20);
  }
}

let hub: Hub;
let api: FakeSession;
let web: FakeSession;
let sleeper: Subprocess;

beforeAll(async () => {
  runMigrations();
  sleeper = Bun.spawn(["sleep", "60"]); // a second live pid
  api = await fakeSession("Agent 01", process.pid, "api");
  web = await fakeSession("Agent 02", sleeper.pid, "web");
  hub = new Hub();
  await hub.start();
});

afterAll(async () => {
  await hub.stop();
  api.listener.stop(true);
  web.listener.stop(true);
  sleeper.kill();
  for (const pid of [process.pid, sleeper.pid]) rmSync(join(SESSIONS, `${pid}.json`), { force: true });
});

describe("hub relay", () => {
  test("discovers live sessions from the registry", () => {
    const names = hub.sessions().map((s) => s.name).sort();
    expect(names).toEqual(["Agent 01", "Agent 02"]);
  });

  test("direct message reaches the session with the hub as reply address", async () => {
    await hub.sendDirect(String(api.pid), "status?");
    await until(() => api.inbox.length === 1);
    expect(api.inbox[0]).toMatchObject({ body: "status?", from: hub.address });
  });

  test("a reply from a session outside any room lands in its direct thread", async () => {
    await reply(api, hub.socketPath, "all green");
    await until(() => hub.directMessages(api.sessionId).length === 2);
    expect(hub.directMessages(api.sessionId).at(-1)).toMatchObject({ senderKind: "session", body: "all green" });
  });

  test("joining a room briefs the member and announces it to others", async () => {
    hub.createRoom({ name: "Checkout Feature", topic: "ship checkout", context: "API owns the contract." });
    api.inbox.length = 0;
    await hub.addMember("checkout-feature", api.sessionId);
    await until(() => api.inbox.length === 1);
    expect(api.inbox[0]?.body).toContain("You joined AgentHub room #checkout-feature as @api");
    expect(api.inbox[0]?.body).toContain("API owns the contract.");

    await hub.addMember("checkout-feature", web.sessionId);
    await until(() => web.inbox.length === 1 && api.inbox.length === 2);
    expect(api.inbox[1]?.body).toContain("@web");
    expect(web.inbox[0]?.body).toContain("- @api — Agent 01 in /work/api");
  });

  test("a member's reply fans out to the other members, tag stripped", async () => {
    await reply(api, hub.socketPath, "#checkout-feature The endpoint is live at /v2/checkout");
    await until(() => web.inbox.length === 2);
    expect(web.inbox[1]).toMatchObject({ fromName: "AgentHub #checkout-feature" });
    expect(web.inbox[1]?.body).toBe("#checkout-feature — @api:\nThe endpoint is live at /v2/checkout");
    expect(api.inbox.length).toBe(2); // sender does not get an echo
  });

  test("untagged reply from a single-room member routes to that room", async () => {
    await reply(web, hub.socketPath, "wired up, thanks");
    await until(() => api.inbox.length === 3);
    expect(api.inbox[2]?.body).toContain("@web:\nwired up");
  });

  test("@operator-only messages are logged but not relayed", async () => {
    const before = web.inbox.length;
    await reply(api, hub.socketPath, "@operator need a decision on pricing");
    await until(() => hub.roomMessages("checkout-feature").at(-1)?.body.includes("pricing") === true);
    await Bun.sleep(100);
    expect(web.inbox.length).toBe(before);
  });

  test("stray @words don't swallow a broadcast", async () => {
    const before = web.inbox.length;
    await hub.postToRoom("checkout-feature", "bump @types/react please");
    await until(() => web.inbox.length === before + 1);
  });

  test("paused rooms log without relaying", async () => {
    hub.updateRoom("checkout-feature", { paused: true });
    const before = web.inbox.length;
    await reply(api, hub.socketPath, "#checkout-feature still there?");
    await until(() => hub.roomMessages("checkout-feature").at(-1)?.body === "still there?");
    await Bun.sleep(100);
    expect(web.inbox.length).toBe(before);
    hub.updateRoom("checkout-feature", { paused: false });
  });

  test("messages to an offline member queue and flush when it returns", async () => {
    web.listener.stop(true);
    rmSync(join(SESSIONS, `${sleeper.pid}.json`));
    await hub.registry.refresh();
    expect(hub.room("checkout-feature").members.find((m) => m.alias === "web")?.online).toBe(false);

    const msg = await hub.postToRoom("checkout-feature", "web, you there?");
    expect(msg.deliveries.find((d) => d.sessionId === web.sessionId)?.status).toBe("pending");

    const back = await fakeSession("Agent 02", sleeper.pid, "web");
    // Same conversation, new process: reuse the session id like `--resume` does.
    await Bun.write(
      join(SESSIONS, `${sleeper.pid}.json`),
      JSON.stringify({ ...(await Bun.file(join(SESSIONS, `${sleeper.pid}.json`)).json()), sessionId: web.sessionId }),
    );
    await hub.registry.refresh();
    await until(() => back.inbox.some((m) => m.body.includes("web, you there?")));
    back.listener.stop(true);
  });
});
