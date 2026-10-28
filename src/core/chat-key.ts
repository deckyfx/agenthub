/**
 * Key of a live chat: the session, or `<session>/<agentId>` for one of its
 * subagents. Browser-safe (shared by the hub, server and clients).
 */
export function chatKey(sessionId: string, agentId?: string): string {
  return agentId ? `${sessionId}/${agentId}` : sessionId;
}
