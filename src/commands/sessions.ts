import { SessionRegistry, type Session } from "../core/sessions";
import { client, errorMessage, serverIsUp } from "../lib/client";
import { envConfig } from "../env-config";
import { fail, printJson } from "./output";

/** Scan the session registry once (no server needed). */
export async function scanSessions(): Promise<SessionRegistry> {
  const registry = new SessionRegistry();
  await registry.refresh();
  return registry;
}

/** Short relative time, e.g. `3m`. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function printTable(sessions: Session[]): void {
  if (sessions.length === 0) {
    console.log(`No live Claude Code sessions in ${envConfig.SESSIONS_DIR}`);
    return;
  }
  const rows = sessions.map((s) => [String(s.pid), s.name, s.status, s.kind === "interactive" ? s.entrypoint : s.kind, ago(s.statusUpdatedAt), s.cwd]);
  const head = ["PID", "NAME", "STATUS", "FROM", "SINCE", "CWD"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0))).join("  ");
  console.log(fmt(head));
  for (const r of rows) console.log(fmt(r));
}

/** `agenthub ls` */
export async function runLs(json: boolean): Promise<void> {
  const sessions = (await scanSessions()).list();
  if (json) printJson(sessions);
  else printTable(sessions);
}

/** `agenthub send <session> <message>` — goes through the server so replies are captured. */
export async function runSend(session: string, body: string): Promise<void> {
  if (!(await serverIsUp())) fail(`AgentHub server is not running at ${envConfig.SERVER_URL} — replies would be lost. Start it with 'agenthub server'.`);
  const { data, error } = await client.api.sessions({ id: session }).messages.post({ body });
  if (error) fail(errorMessage(error));
  printJson({ ok: true, message: data });
}
