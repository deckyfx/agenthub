import { startServer } from "../server";
import { MigrationManager } from "../db/migration-manager";

/**
 * server — Start the AgentHub dashboard and API server.
 * Always ensures the database schema is up to date before serving, so a fresh
 * install works whether or not `agenthub init` was run first.
 * Usage: agenthub server [--port 3000]
 */
export async function runServer(port?: number): Promise<void> {
  if (port) {
    process.env["SERVER_PORT"] = String(port);
  }

  // Ensure DB tables exist before accepting requests (binary uses embedded SQL).
  await MigrationManager.init({ autoMigrate: true });

  startServer();
}
