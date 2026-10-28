import { treaty } from "@elysiajs/eden";
import type { App } from "../../server";

/**
 * Type-safe API client. Uses window.location.origin so calls always hit the
 * server that served the page (no CORS, any port).
 */
export const api = treaty<App>(window.location.origin);

/** Eden's `{ error }` → readable message. */
export function errorMessage(error: { status: unknown; value: unknown }): string {
  const v = error.value as { error?: unknown; message?: unknown } | string | undefined;
  if (typeof v === "string") return v;
  if (v && typeof v.error === "string") return v.error;
  if (v && typeof v.message === "string") return v.message;
  return `HTTP ${String(error.status)}`;
}
