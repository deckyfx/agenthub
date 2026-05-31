/** Base error for all AgentHub errors */
export class AgentHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentHubError";
  }
}

/** Agent does not exist in the DB */
export class AgentNotFoundError extends AgentHubError {
  constructor(id: string) {
    super(`Agent '${id}' not found`);
    this.name = "AgentNotFoundError";
  }
}

/** Channel does not exist in the DB */
export class ChannelNotFoundError extends AgentHubError {
  constructor(id: string) {
    super(`Channel '${id}' not found`);
    this.name = "ChannelNotFoundError";
  }
}

/** Alias already taken within the channel */
export class AliasConflictError extends AgentHubError {
  constructor(alias: string, channelId: string) {
    super(`Alias '@${alias}' is already taken in channel '${channelId}'`);
    this.name = "AliasConflictError";
  }
}

/** Agent is not subscribed to the channel */
export class NotSubscribedError extends AgentHubError {
  constructor(agentId: string, channelId: string) {
    super(`Agent '${agentId}' is not subscribed to channel '${channelId}'`);
    this.name = "NotSubscribedError";
  }
}

/** Group does not exist */
export class GroupNotFoundError extends AgentHubError {
  constructor(id: string) {
    super(`Group '${id}' not found`);
    this.name = "GroupNotFoundError";
  }
}

/** Alias could not be resolved to an agent in the given channel */
export class AliasNotFoundError extends AgentHubError {
  constructor(alias: string, channelId: string) {
    super(`Alias '@${alias}' not found in channel '${channelId}'`);
    this.name = "AliasNotFoundError";
  }
}

/** Input validation error */
export class ValidationError extends AgentHubError {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ValidationError";
  }

  static throw(message: string, field?: string): never {
    throw new ValidationError(message, field);
  }
}
