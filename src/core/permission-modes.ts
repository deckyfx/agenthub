/** Values `claude --permission-mode` accepts. Omitted = Claude Code's default. */
export const PERMISSION_MODES = ["manual", "acceptEdits", "auto", "plan", "dontAsk", "bypassPermissions"] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];
