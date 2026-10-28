/** HTTP layer via app.handle() — no port is bound; paths isolated by test-setup.ts. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { runMigrations } = await import("../db/migrate");
const { Hub } = await import("../core/hub");
const { createServer } = await import("./index");

let hub: InstanceType<typeof Hub>;
let app: ReturnType<typeof createServer>;

beforeAll(async () => {
  runMigrations();
  hub = new Hub();
  await hub.start();
  app = createServer(hub);
});

afterAll(async () => {
  await hub.stop();
});

const req = (path: string, init: RequestInit & { host?: string } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("host", init.host ?? "127.0.0.1:3000");
  if (init.body) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://127.0.0.1:3000${path}`, { ...init, headers }));
};

describe("guard", () => {
  test("loopback, no origin → allowed", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, name: "agenthub" });
  });

  test("non-loopback Host (DNS rebinding) → 403 naming the header", async () => {
    const res = await req("/api/health", { host: "evil.example:3000" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Host 'evil.example:3000' is not allowed");
  });

  test("HUB_ALLOWED_HOSTS entries are accepted (any port, any case)", async () => {
    expect((await req("/api/health", { host: "Hub.Tailnet.Example:3000" })).status).toBe(200);
  });

  test("cross-origin browser request → 403", async () => {
    const res = await req("/api/rooms", { method: "POST", body: JSON.stringify({ name: "x" }), headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("same-origin browser request → allowed", async () => {
    const res = await req("/api/rooms", { headers: { origin: "http://127.0.0.1:3000" } });
    expect(res.status).toBe(200);
  });
});

describe("rooms API", () => {
  test("create → list → conflict", async () => {
    const created = await req("/api/rooms", { method: "POST", body: JSON.stringify({ name: "Infra Upgrade", topic: "k8s 1.40" }) });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ id: "infra-upgrade", topic: "k8s 1.40", members: [] });

    const dup = await req("/api/rooms", { method: "POST", body: JSON.stringify({ name: "infra upgrade" }) });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ ok: false, error: "Room #infra-upgrade already exists" });
  });

  test("unknown room → 404 with error shape", async () => {
    const res = await req("/api/rooms/nope/messages");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Room 'nope' not found" });
  });

  test("message to unknown session → 404", async () => {
    const res = await req("/api/sessions/424242/messages", { method: "POST", body: JSON.stringify({ body: "hi" }) });
    expect(res.status).toBe(404);
  });

  test("body validation → 422", async () => {
    const res = await req("/api/rooms", { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(422);
  });

  test("spawn rejects relative cwd before touching claude", async () => {
    const res = await req("/api/spawn", { method: "POST", body: JSON.stringify({ cwd: "relative/dir", name: "x" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "cwd must be an absolute path" });
  });
});

describe("real listener (port 0)", () => {
  // Native HTML routing and WS upgrades only exist on a bound server, not app.handle().
  let base = "";
  let live: ReturnType<typeof createServer>;

  beforeAll(() => {
    live = createServer(hub).listen({ hostname: "127.0.0.1", port: 0 });
    base = `127.0.0.1:${live.server?.port}`;
  });

  afterAll(async () => {
    await live.stop();
  });

  test("parameterized API routes win over the SPA wildcard on a real listener", async () => {
    const res = await fetch(`http://${base}/api/sessions/${crypto.randomUUID()}/subagents`);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual([]);
  });

  test("unknown /api path → JSON 404, not the SPA", async () => {
    const res = await fetch(`http://${base}/api/definitely/not/here`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("No API route GET /api/definitely/not/here");
  });

  test("SPA routes serve the HTML shell, not a serialized bundle", async () => {
    for (const path of ["/", "/room/anything"]) {
      const res = await fetch(`http://${base}${path}`);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain('<div id="root">');
    }
  });

  const openWs = (origin: string) =>
    new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://${base}/api/ws`, { headers: { origin } } as unknown as string[]);
      ws.onmessage = (e) => {
        resolve(`message:${JSON.parse(String(e.data)).type}`);
        ws.close();
      };
      ws.onerror = () => resolve("error");
      ws.onclose = () => resolve("closed");
    });

  test("same-origin WebSocket gets the snapshot", async () => {
    expect(await openWs(`http://${base}`)).toBe("message:sessions");
  });

  test("cross-origin WebSocket is refused", async () => {
    expect(await openWs("https://evil.example")).not.toStartWith("message:");
  });
});
