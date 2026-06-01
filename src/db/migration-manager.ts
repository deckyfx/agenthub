import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { sql } from "drizzle-orm";
import { envConfig } from "../env-config";
import { EMBEDDED_MIGRATIONS } from "./embedded-migrations";

export interface MigrationConfig {
  /** Terminate process if pending migrations exist (production safety) */
  strict?: boolean;
  /** Automatically run pending migrations on startup */
  autoMigrate?: boolean;
}

/**
 * True when running as a compiled Bun binary (bun build --compile).
 * In binary mode the drizzle/ folder is not on disk — we use embedded SQL.
 */
const IS_BINARY = !Bun.main.endsWith(".ts");

export class MigrationManager {
  private static readonly migrationsDir = "drizzle";

  /**
   * Initialize migration system. Call at app startup.
   *
   * @example Development — auto-migrate
   * await MigrationManager.init({ autoMigrate: true });
   *
   * @example Production — fail fast on pending migrations
   * await MigrationManager.init({ strict: true });
   */
  static async init(config: MigrationConfig = {}): Promise<void> {
    const { strict = false, autoMigrate = false } = config;

    const total = IS_BINARY
      ? EMBEDDED_MIGRATIONS.length
      : await this.countMigrationFiles();

    if (total === 0) {
      console.log("ℹ️  No migrations found");
      return;
    }

    const pendingCount = await this.getPendingCount(total);
    if (pendingCount === 0) {
      console.log("✅ Database Schema is up to date");
      return;
    }

    if (strict) {
      console.error(`❌ ${pendingCount} pending migration(s) detected`);
      console.error("💡 Run 'bun run db:migrate' to apply migrations");
      process.exit(1);
    }

    if (autoMigrate) {
      console.log(`🔄 Auto-migrating ${pendingCount} pending migration(s)...`);
      await this.runMigrations();
      console.log("✅ Auto-migration completed");
      return;
    }

    console.warn(`⚠️  ${pendingCount} pending migration(s) — run 'agenthub db:migrate'`);
  }

  /** Run all pending migrations */
  static async runMigrations(): Promise<void> {
    console.log("🚀 Running migrations...\n");

    if (IS_BINARY) {
      await this.runEmbedded();
    } else {
      await this.runFromDisk();
    }

    console.log("\n🎉 Migrations completed successfully");
  }

  /** Apply embedded SQL migrations directly (binary mode) */
  private static async runEmbedded(): Promise<void> {
    const sqlite = new Database(envConfig.HUB_DB_PATH);
    sqlite.exec("PRAGMA foreign_keys=ON;");

    // Ensure tracking table exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        hash      TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    const applied = new Set(
      sqlite
        .query<{ hash: string }, []>("SELECT hash FROM __drizzle_migrations")
        .all()
        .map((r) => r.hash),
    );

    for (const { name, sql: migrationSql } of EMBEDDED_MIGRATIONS) {
      if (applied.has(name)) continue;

      console.log(`  → applying ${name}`);
      sqlite.exec(migrationSql);
      sqlite
        .query("INSERT INTO __drizzle_migrations (hash) VALUES (?)")
        .run(name);
    }

    sqlite.close();
  }

  /** Apply migrations from the drizzle/ folder on disk (dev mode) */
  private static async runFromDisk(): Promise<void> {
    const sqlite = new Database(envConfig.HUB_DB_PATH);
    sqlite.exec("PRAGMA foreign_keys=ON;");
    const db = drizzle(sqlite);

    try {
      await migrate(db, { migrationsFolder: this.migrationsDir });
    } catch (error) {
      console.error("\n❌ Migration failed:", error);
      throw error;
    } finally {
      sqlite.close();
    }
  }

  private static async countMigrationFiles(): Promise<number> {
    try {
      const glob = new Bun.Glob("*.sql");
      const files = await Array.fromAsync(glob.scan(this.migrationsDir));
      return files.length;
    } catch {
      return 0;
    }
  }

  private static async getPendingCount(total: number): Promise<number> {
    try {
      const sqlite = new Database(envConfig.HUB_DB_PATH);
      const db = drizzle(sqlite);
      try {
        const applied = await db.all<{ hash: string }>(
          sql`SELECT hash FROM __drizzle_migrations`,
        );
        sqlite.close();
        return total - applied.length;
      } catch {
        sqlite.close();
        return total;
      }
    } catch {
      return total;
    }
  }
}
