import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env["HUB_DB_PATH"] ?? "./hub.db",
  },
} satisfies Config;
