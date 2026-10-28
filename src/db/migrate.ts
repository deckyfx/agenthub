import { sqlite } from "./index";
import { EMBEDDED_MIGRATIONS } from "./embedded-migrations";

/**
 * Apply pending migrations. SQL is embedded at build time (see
 * `embed-migrations.ts`), so dev and the compiled binary share one path and
 * the binary needs no `drizzle/` folder on disk.
 */
export function runMigrations(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __agenthub_migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  const applied = new Set(
    sqlite.query<{ name: string }, []>("SELECT name FROM __agenthub_migrations").all().map((r) => r.name),
  );
  for (const { name, sql } of EMBEDDED_MIGRATIONS) {
    if (applied.has(name)) continue;
    sqlite.transaction(() => {
      // drizzle-kit separates statements with this marker
      for (const stmt of sql.split("--> statement-breakpoint")) if (stmt.trim()) sqlite.exec(stmt);
      sqlite.query("INSERT INTO __agenthub_migrations (name) VALUES (?)").run(name);
    })();
    console.log(`  → applied migration ${name}`);
  }
}
