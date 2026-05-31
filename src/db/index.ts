import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { envConfig } from "../env-config";
import * as schema from "./schema";

/**
 * Singleton SQLite connection to the shared hub database.
 * Path is resolved from HUB_DB_PATH env var (default: ./hub.db).
 */
const sqlite = new Database(envConfig.HUB_DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.exec("PRAGMA journal_mode=WAL;");
sqlite.exec("PRAGMA foreign_keys=ON;");

export const db = drizzle(sqlite, { schema });

export { sqlite };
