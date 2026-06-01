import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { apiPlugin } from "./plugins/routeApi";
import { appPlugin } from "./plugins/routeApp";
import { envConfig } from "../env-config";
import { VERSION } from "../version";

/**
 * AgentHub dashboard server.
 * API routes are registered before the wildcard React SPA route.
 * Start with: agenthub server
 */
export function createServer() {
  return new Elysia()
    .use(cors())
    .use(serverTiming())
    .use(apiPlugin)
    .use(appPlugin);
}

export function startServer(): void {
  const app = createServer().listen(envConfig.SERVER_PORT);
  const port = app.server?.port;
  // Startup banner: version + where the dashboard and database live.
  console.log(`\n  🦊 AgentHub v${VERSION}`);
  console.log(`     Dashboard  http://localhost:${port}`);
  console.log(`     Database   ${envConfig.HUB_DB_PATH}\n`);
}

export type App = ReturnType<typeof createServer>;
