import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { envConfig } from "../env-config";
import { catchSync } from "./error-handler";

/** `~/.agenthub/server.pid` — which process owns the hub socket and port. */
function pidFilePath(): string {
  return join(envConfig.HUB_HOME, "server.pid");
}

/** Record this process as the running server. */
export async function writeServerPid(): Promise<void> {
  await Bun.write(pidFilePath(), `${process.pid}\n`);
}

/** Remove the pid file if it still names this process. */
export function clearServerPid(): void {
  if (readPidSync() === process.pid) catchSync(() => unlinkSync(pidFilePath()));
}

/** The pid of a live server recorded in the pid file, if any. */
export async function runningServerPid(): Promise<number | undefined> {
  const file = Bun.file(pidFilePath());
  if (!(await file.exists())) return undefined;
  const pid = Number.parseInt(await file.text(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  // Signal 0 only probes for existence.
  const [err] = catchSync(() => process.kill(pid, 0));
  return err ? undefined : pid;
}

function readPidSync(): number | undefined {
  const [err, text] = catchSync(() => readFileSync(pidFilePath(), "utf8"));
  return err ? undefined : Number.parseInt(text, 10);
}
