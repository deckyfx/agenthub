import { client, ensureServer, errorMessage } from "../lib/client";
import { fail, printJson } from "./output";
import { scanSessions } from "./sessions";

/** `agenthub rooms` */
export async function runRooms(): Promise<void> {
  await ensureServer();
  const { data, error } = await client.api.rooms.get();
  if (error) fail(errorMessage(error));
  printJson(data);
}

/** `agenthub room:create <name>` */
export async function runRoomCreate(input: { name: string; topic?: string; context?: string }): Promise<void> {
  await ensureServer();
  const { data, error } = await client.api.rooms.post(input);
  if (error) fail(errorMessage(error));
  printJson({ ok: true, room: data });
}

/** `agenthub room:add <room> <session>` — resolves the session locally, then joins it. */
export async function runRoomAdd(roomId: string, ref: string, alias?: string): Promise<void> {
  await ensureServer();
  const session = (await scanSessions()).resolve(ref);
  const { data, error } = await client.api.rooms({ id: roomId }).members.post({ sessionId: session.sessionId, alias });
  if (error) fail(errorMessage(error));
  printJson({ ok: true, room: data });
}

/** `agenthub room:post <room> <message>` */
export async function runRoomPost(roomId: string, body: string): Promise<void> {
  await ensureServer();
  const { data, error } = await client.api.rooms({ id: roomId }).messages.post({ body });
  if (error) fail(errorMessage(error));
  printJson({ ok: true, message: data });
}
