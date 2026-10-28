import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { envConfig } from "../env-config";
import * as schema from "./schema";

/** Singleton SQLite connection to the hub database. */
const sqlite = new Database(envConfig.HUB_DB_PATH, { create: true });

sqlite.exec("PRAGMA journal_mode=WAL;");
// Per-connection pragma — must be set on every connection that writes.
sqlite.exec("PRAGMA foreign_keys=ON;");

export const db = drizzle(sqlite, { schema });

export { sqlite };
