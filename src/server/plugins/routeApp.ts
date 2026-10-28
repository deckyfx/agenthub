import { Elysia } from "elysia";
import index from "../../web/index.html";

/** React SPA: `/` and every client-side route serve the HTML bundle. */
export const appPlugin = new Elysia().get("/", index).get("/*", index);
