/**
 * SQL migrations embedded at build time via Bun import attributes.
 * Used by MigrationManager when running as a compiled binary
 * (where the drizzle/ folder is not available on disk).
 *
 * Re-run `bun run db:embed` after generating new migrations.
 */
import m0 from "../../drizzle/0000_tough_thunderball.sql" with { type: "text" };
import m1 from "../../drizzle/0001_futuristic_clint_barton.sql" with { type: "text" };

export const EMBEDDED_MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: "0000_tough_thunderball", sql: m0 },
  { name: "0001_futuristic_clint_barton", sql: m1 },
];
