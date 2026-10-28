import { Elysia } from "elysia";
import { envConfig } from "../env-config";
import { NAME, VERSION } from "../version";
import { runMigrations } from "../db/migrate";
import { clearServerPid, writeServerPid } from "../lib/pidfile";
import { chatKey, Hub } from "../core/hub";
import { allowedHosts, isWildcardBind } from "./plugins/guard";
import { apiPlugin } from "./plugins/routeApi";
import { appPlugin } from "./plugins/routeApp";

/** Build the Elysia app around a hub (guarded API first, SPA wildcard last). */
export function createServer(hub: Hub) {
  let fetchApp: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 503 });
  const app = new Elysia({
    serve: {
      // The SPA's `/*` lives in Bun's native route table, which answers before
      // Elysia's fetch. Without a more specific native `/api/*`, unknown or
      // wildcard-only API paths would be served the HTML shell.
      routes: { "/api/*": (request: Request) => fetchApp(request) },
    },
  })
    .use(apiPlugin(hub))
    .use(appPlugin);
  fetchApp = app.fetch;
  return app;
}

/** The app type Eden Treaty clients are generated from. */
export type App = ReturnType<typeof createServer>;

/**
 * Migrate, start the hub, serve the dashboard, and push hub events to every
 * WebSocket client. Prints a startup banner.
 */
export async function startServer(opts: { port?: number } = {}): Promise<void> {
  runMigrations();
  const hub = new Hub();
  await hub.start();
  await writeServerPid();
  process.once("exit", clearServerPid);

  const port = opts.port ?? envConfig.SERVER_PORT;
  const app = createServer(hub).listen({ hostname: envConfig.SERVER_HOST, port });
  hub.on("event", (event) => {
    const topic =
      event.type === "transcript"
        ? `transcript:${chatKey(event.sessionId, event.agentId)}`
        : event.type === "subagents"
          ? `transcript:${event.sessionId}`
          : "hub";
    app.server?.publish(topic, JSON.stringify(event));
  });

  const shutdown = async () => {
    await hub.stop();
    await app.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  const sessions = hub.sessions();
  const wildcard = isWildcardBind();
  const urls = wildcard
    ? [...allowedHosts()].filter((h) => h !== "0.0.0.0" && h !== "::" && h !== "[::]" && h !== "[::1]").map((h) => `http://${h}:${port}`)
    : [`http://${envConfig.SERVER_HOST}:${port}`];
  console.log(`
  ${NAME} v${VERSION}
  Dashboard   ${urls.join("\n              ")}
  Hub socket  ${hub.socketPath}
  Sessions    ${sessions.length} live (${envConfig.SESSIONS_DIR})
  History     ${envConfig.HUB_DB_PATH}
`);
  if (wildcard) {
    console.warn(`  ⚠ SERVER_HOST=${envConfig.SERVER_HOST}: anyone on your network can message your Claude sessions.
    Use SERVER_HOST=127.0.0.1 unless you need LAN access.
`);
  }
}
