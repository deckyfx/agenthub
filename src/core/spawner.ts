import { isAbsolute } from "node:path";
import { stat } from "node:fs/promises";
import { envConfig } from "../env-config";
import { catchError } from "../lib/error-handler";
import { SpawnError, UntrustedWorkspaceError, ValidationError } from "../errors/custom-errors";
import type { PermissionMode } from "./permission-modes";

/** A request to start a new background Claude Code session. */
export interface SpawnRequest {
  /** Absolute working directory (must be a trusted workspace). */
  cwd: string;
  /** Session display name (`-n`). */
  name: string;
  /** Initial prompt. */
  prompt?: string;
  permissionMode?: PermissionMode;
  model?: string;
}

/** Outcome of `claude --bg`. */
export interface SpawnResult {
  /** Background job id (`claude attach/logs/stop <id>`), when it could be parsed. */
  jobId?: string;
  output: string;
}

/**
 * Environment for child `claude` processes. Strips Claude Code's own session
 * variables so a hub started from inside a Claude session doesn't make the
 * child believe it is nested in (or reply as) that session.
 */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(Bun.env)) {
    if (v === undefined || k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
    env[k] = v;
  }
  return env;
}

/** Run the claude CLI to completion and capture combined output. */
async function runClaude(args: string[], cwd?: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([envConfig.CLAUDE_BIN, ...args], {
    cwd,
    env: childEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: `${stdout}${stderr}`.trim() };
}

/**
 * Start a background Claude Code session (`claude --bg`). It registers its own
 * messaging socket like any other session, so the hub discovers it through
 * the session registry.
 *
 * @throws ValidationError | UntrustedWorkspaceError | SpawnError
 */
export async function spawnSession(req: SpawnRequest): Promise<SpawnResult> {
  if (!isAbsolute(req.cwd)) throw new ValidationError("cwd must be an absolute path", "cwd");
  const [statErr, st] = await catchError(stat(req.cwd));
  if (statErr || !st.isDirectory()) throw new ValidationError(`Not a directory: ${req.cwd}`, "cwd");
  if (!req.name.trim()) throw new ValidationError("name is required", "name");

  const args = ["--bg", "-n", req.name.trim()];
  if (req.permissionMode) args.push("--permission-mode", req.permissionMode);
  if (req.model) args.push("--model", req.model);
  if (req.prompt?.trim()) args.push(req.prompt.trim());

  const [err, res] = await catchError(runClaude(args, req.cwd));
  if (err) throw new SpawnError(`could not run '${envConfig.CLAUDE_BIN}': ${err.message}`);
  if (/workspace not trusted/i.test(res.output)) throw new UntrustedWorkspaceError(req.cwd);
  if (res.code !== 0) throw new SpawnError(res.output || `claude exited with code ${res.code}`);

  // The CLI prints the short job id; take the first id-looking token.
  const jobId = /\b([0-9a-f]{6,12})\b/i.exec(res.output)?.[1];
  return { jobId, output: res.output };
}

/**
 * Stop a background session (`claude stop <jobId>`). Its conversation is kept.
 *
 * @throws SpawnError
 */
export async function stopBackgroundSession(jobId: string): Promise<void> {
  const [err, res] = await catchError(runClaude(["stop", jobId]));
  if (err) throw new SpawnError(err.message);
  if (res.code !== 0) throw new SpawnError(res.output || `claude stop exited with code ${res.code}`);
}
