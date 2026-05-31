import { Elysia } from "elysia";
import index from "../public/index.html";

/** Serve the React SPA for all non-API routes */
export const appPlugin = new Elysia()
  .get("/", index)
  .get("/*", index);
