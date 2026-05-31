import { Database } from "bun:sqlite";
import { MigrationManager } from "../db/migration-manager";
import { envConfig } from "../env-config";

/**
 * Initialize the hub database.
 *
 * Creates the database file (and its parent directory) and applies every
 * migration, so the hub is ready to use after a single `agenthub init`. Works
 * both as a compiled binary (embedded SQL) and in development (drizzle/ folder).
 *
 * @param dbPath - Optional path override; defaults to the configured
 *   HUB_DB_PATH (`~/.agenthub/hub.db`).
 */
export async function runInit(dbPath?: string): Promise<void> {
  if (dbPath) process.env["HUB_DB_PATH"] = dbPath;

  // Accessing the getter expands `~` and creates the parent directory.
  const resolved = envConfig.HUB_DB_PATH;
  console.log(`🗄️  Initializing AgentHub database at: ${resolved}`);

  // Touch the file so the connection (and migrations) have something to open.
  const sqlite = new Database(resolved);
  sqlite.exec("PRAGMA journal_mode=WAL;");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  sqlite.close();

  await MigrationManager.runMigrations();

  console.log("✅ Database ready");
}
