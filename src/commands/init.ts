import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { MigrationManager } from "../db/migration-manager";

/**
 * Initialize the hub database at the given path.
 * Creates the file and runs all migrations.
 */
export async function runInit(dbPath: string): Promise<void> {
  console.log(`🗄️  Initializing AgentHub database at: ${dbPath}`);

  // Touch the file (create if not exists)
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode=WAL;");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  sqlite.close();

  console.log("✅ Database file created");
  console.log('💡 Run "bun run db:generate" to generate migrations from schema');
  console.log('💡 Run "bun run db:migrate" to apply migrations');
}
