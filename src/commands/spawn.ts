import type { PermissionMode } from "../core/permission-modes";
import { client, ensureServer, errorMessage } from "../lib/client";
import { fail, printJson } from "./output";

/** `agenthub spawn` — start a background Claude session through the hub. */
export async function runSpawn(req: {
  cwd: string;
  name: string;
  prompt?: string;
  permissionMode?: PermissionMode;
  model?: string;
  roomId?: string;
}): Promise<void> {
  await ensureServer();
  const { data, error } = await client.api.spawn.post(req);
  if (error) fail(errorMessage(error));
  printJson({ ok: true, ...data });
}
