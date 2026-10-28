import { treaty } from "@elysiajs/eden";
import type { App } from "../server";
import { envConfig } from "../env-config";
import { ServerUnavailableError } from "../errors/custom-errors";

/** Type-safe client for terminal-side callers (CLI, TUI). */
export const client = treaty<App>(envConfig.SERVER_URL);

/** Eden's `{ error }` → readable message. */
export function errorMessage(error: { status: unknown; value: unknown }): string {
  const v = error.value as { error?: unknown; message?: unknown } | string | undefined;
  if (typeof v === "string") return v;
  if (v && typeof v.error === "string") return v.error;
  if (v && typeof v.message === "string") return v.message;
  return `HTTP ${String(error.status)}`;
}

/** True if a hub server answers /api/health. */
export async function serverIsUp(): Promise<boolean> {
  const { data } = await client.api.health.get().catch(() => ({ data: null }));
  return data?.ok === true;
}

/** argv that re-invokes this program (works for `bun run src/index.ts` and the compiled binary). */
function selfCommand(...args: string[]): string[] {
  return Bun.main.endsWith(".ts") ? [process.execPath, Bun.main, ...args] : [process.execPath, ...args];
}

/**
 * Make sure a hub server is running, starting one in the background if needed.
 *
 * A one-shot CLI command leaves the server it started running (rooms keep
 * relaying) and says so on stderr. With `owned`, the caller gets `stop` and
 * is expected to call it on exit, so nothing outlives it (the TUI).
 *
 * @throws ServerUnavailableError if it does not come up within ~6 s.
 */
export async function ensureServer(opts: { owned?: boolean } = {}): Promise<{ started: boolean; stop: () => void }> {
  if (await serverIsUp()) return { started: false, stop: () => {} };
  const proc = Bun.spawn(selfCommand("server"), { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  proc.unref();
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(200);
    if (await serverIsUp()) {
      if (!opts.owned) {
        console.error(`Started an AgentHub server in the background (pid ${proc.pid}). It keeps running; stop it with \`kill ${proc.pid}\`.`);
      }
      return { started: true, stop: () => proc.kill() };
    }
  }
  proc.kill();
  throw new ServerUnavailableError(envConfig.SERVER_URL);
}
