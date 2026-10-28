import { hostname as osHostname, networkInterfaces } from "node:os";
import { envConfig } from "../../env-config";
import { ForbiddenError } from "../../errors/custom-errors";

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** True when the server listens on every interface. */
export function isWildcardBind(host: string = envConfig.SERVER_HOST): boolean {
  return host === "0.0.0.0" || host === "::" || host === "[::]";
}

/** This machine's own names and interface addresses (IPv6 bracketed, as in a Host header). */
function machineHosts(): string[] {
  const name = osHostname().toLowerCase();
  const names = [name, name.endsWith(".local") ? name : `${name}.local`];
  const addrs = Object.values(networkInterfaces())
    .flat()
    .flatMap((i) => (i ? [i.family === "IPv6" ? `[${i.address.split("%")[0]}]` : i.address] : []));
  return [...names, ...addrs];
}

let allowed: Set<string> | undefined;

/**
 * Hostnames the dashboard may be addressed by: loopback, the bind host, and —
 * on a wildcard bind — this machine's own names/IPs, plus `HUB_ALLOWED_HOSTS`.
 * Computed once (interfaces rarely change while the hub runs).
 */
export function allowedHosts(): Set<string> {
  if (allowed) return allowed;
  const host = envConfig.SERVER_HOST.toLowerCase();
  allowed = new Set([...LOOPBACK, host, ...(isWildcardBind(host) ? machineHosts() : []), ...envConfig.HUB_ALLOWED_HOSTS]);
  return allowed;
}

/** Hostname of a `Host` header / URL host (drops the port, keeps IPv6 brackets). */
function hostOnly(host: string): string {
  const h = host.toLowerCase();
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : (h.split(":")[0] ?? "");
}

/**
 * Why a request is refused, or undefined if it's acceptable. Anything that
 * reaches this API can type into Claude sessions, so:
 * - the Host header must be one of {@link allowedHosts} (defeats DNS rebinding), and
 * - a browser Origin, when present, must be that same host (defeats CSRF and
 *   cross-site WebSocket hijacking).
 */
export function rejectReason(request: Request): string | undefined {
  const host = request.headers.get("host") ?? "";
  if (!allowedHosts().has(hostOnly(host))) {
    return `Host '${host}' is not allowed — open the dashboard via ${isWildcardBind() ? "this machine's IP/hostname or " : ""}127.0.0.1, or add it to HUB_ALLOWED_HOSTS`;
  }
  const origin = request.headers.get("origin");
  if (!origin) return undefined; // CLI / TUI clients send none
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return `Origin '${origin}' is not a valid URL`;
  }
  return originHost.toLowerCase() === host.toLowerCase() ? undefined : `cross-origin request from '${origin}'`;
}

/**
 * `beforeHandle` hook for every `/api` route, including the `/api/ws` upgrade.
 *
 * Deliberately not a global `onRequest`: Elysia hands HTML bundles to Bun's
 * native router only when a route has no hooks, and with one the SPA is
 * serialized as `{}`. The static shell carries no data; everything it loads
 * comes through `/api`. Throws rather than returns so the refusal stays out
 * of every route's inferred response type.
 *
 * @throws ForbiddenError
 */
export function guardHook({ request }: { request: Request }): void {
  const reason = rejectReason(request);
  if (reason) {
    console.warn(`[guard] 403 ${request.method} ${new URL(request.url).pathname}: ${reason}`);
    throw new ForbiddenError(reason);
  }
}
