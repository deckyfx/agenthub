import { lstat } from "node:fs/promises";
import { catchError } from "./error-handler";

/**
 * True if `path` is a Unix socket. (`Bun.file(path).exists()` is false for
 * sockets, so it can't be used for this.)
 */
export async function isSocket(path: string): Promise<boolean> {
  const [err, st] = await catchError(lstat(path));
  return !err && st.isSocket();
}
