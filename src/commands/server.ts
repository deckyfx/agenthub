import { startServer } from "../server";
import { MigrationManager } from "../db/migration-manager";
import { envConfig } from "../env-config";

/**
 * server — Start the AgentHub dashboard and API server.
 * Auto-migrates the database on startup in development mode.
 * Usage: agenthub server [--port 3000]
 */
export async function runServer(port?: number): Promise<void> {
  if (port) {
    process.env["SERVER_PORT"] = String(port);
  }

  // Ensure DB tables exist before accepting requests
  await MigrationManager.init({
    autoMigrate: envConfig.isDevelopment,
    strict: !envConfig.isDevelopment,
  });

  startServer();
}
