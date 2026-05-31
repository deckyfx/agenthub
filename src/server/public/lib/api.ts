import { treaty } from "@elysiajs/eden";
import type { App } from "../../index";

/**
 * Type-safe API client via Eden Treaty.
 * Uses window.location.origin to match whatever host/port is serving the page,
 * avoiding hardcoded URLs and CORS issues.
 */
export const api = treaty<App>(
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000",
);
