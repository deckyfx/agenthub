import { MigrationManager } from "./migration-manager";

/** CLI runner: bun run db:migrate */
async function run(): Promise<void> {
  await MigrationManager.runMigrations();
}

run().catch((error) => {
  console.error("Migration error:", error);
  process.exit(1);
});
