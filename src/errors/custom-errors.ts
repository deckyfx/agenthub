/**
 * Base error for all AgentHub errors. `status` + `toResponse()` follow
 * Elysia's custom-error convention, so a thrown hub error renders as
 * `{ ok: false, error }` with that HTTP status and no onError hook (which
 * would otherwise widen every route's inferred response type).
 */
export class AgentHubError extends Error {
  status = 500;

  constructor(message: string) {
    super(message);
    this.name = "AgentHubError";
  }

  toResponse(): Response {
    return Response.json({ ok: false, error: this.message }, { status: this.status });
  }
}

/** No live Claude Code session matches the given pid / session id / name */
export class SessionNotFoundError extends AgentHubError {
  override status = 404;

  constructor(ref: string) {
    super(`No live Claude Code session matches '${ref}'`);
    this.name = "SessionNotFoundError";
  }
}

/** A name matched more than one live session */
export class AmbiguousSessionError extends AgentHubError {
  override status = 409;

  constructor(ref: string, public readonly candidates: string[]) {
    super(`'${ref}' matches ${candidates.length} sessions: ${candidates.join(", ")} — use a pid`);
    this.name = "AmbiguousSessionError";
  }
}

/** Writing a frame to a session's messaging socket failed */
export class DeliveryError extends AgentHubError {
  override status = 502;

  constructor(target: string, reason: string) {
    super(`Could not deliver to ${target}: ${reason}`);
    this.name = "DeliveryError";
  }
}

/** Another hub already owns the hub socket */
export class HubAlreadyRunningError extends AgentHubError {
  override status = 409;

  constructor(socketPath: string, pid?: number) {
    super(
      pid
        ? `Another AgentHub (pid ${pid}) is already listening on ${socketPath}. Stop it with \`kill ${pid}\`.`
        : `Another AgentHub is already listening on ${socketPath}. Find it with \`lsof ${socketPath}\`.`,
    );
    this.name = "HubAlreadyRunningError";
  }
}

/** The dashboard server is not reachable */
export class ServerUnavailableError extends AgentHubError {
  override status = 503;

  constructor(url: string) {
    super(`AgentHub server is not running at ${url} — start it with 'agenthub server'`);
    this.name = "ServerUnavailableError";
  }
}

/** Room does not exist */
export class RoomNotFoundError extends AgentHubError {
  override status = 404;

  constructor(id: string) {
    super(`Room '${id}' not found`);
    this.name = "RoomNotFoundError";
  }
}

/** Alias or room slug already taken */
export class ConflictError extends AgentHubError {
  override status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** `claude --bg` refuses folders whose workspace trust was never accepted */
export class UntrustedWorkspaceError extends AgentHubError {
  override status = 400;

  constructor(public readonly cwd: string) {
    super(`Workspace not trusted: run 'claude' in ${cwd} once and accept the trust prompt, then retry`);
    this.name = "UntrustedWorkspaceError";
  }
}

/** Spawning a background Claude session failed */
export class SpawnError extends AgentHubError {
  override status = 502;

  constructor(reason: string) {
    super(`Spawn failed: ${reason}`);
    this.name = "SpawnError";
  }
}

/** No API route matches (often: a hub server started from older code) */
export class RouteNotFoundError extends AgentHubError {
  override status = 404;

  constructor(method: string, path: string) {
    super(`No API route ${method} ${path} — if you just updated AgentHub, restart the server`);
    this.name = "RouteNotFoundError";
  }
}

/** Request refused by the API guard (Host / Origin checks) */
export class ForbiddenError extends AgentHubError {
  override status = 403;

  constructor(reason: string) {
    super(`Forbidden: ${reason}`);
    this.name = "ForbiddenError";
  }
}

/** Input validation error */
export class ValidationError extends AgentHubError {
  override status = 400;

  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ValidationError";
  }

  static throw(message: string, field?: string): never {
    throw new ValidationError(message, field);
  }
}
