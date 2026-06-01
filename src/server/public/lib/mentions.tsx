import React from "react";
import { cn } from "../components/ui";

/**
 * Shared parsing/rendering for @mentions and #message-ids in message text.
 *
 * Recognized forms:
 *   - `@alias`        → a channel member
 *   - `@group:<id>`   → a group
 *   - `@all`          → everyone (broadcast)
 *   - `#NNN`          → a message id reference (1–4 digits)
 */
export const MENTION_REGEX = /@([\w-]+(?::[\w-]+)?)/g;
const TOKEN_REGEX = /@([\w-]+(?::[\w-]+)?)|#(\d{1,4})/g;

/** A parsed @mention token. */
export interface MentionPart {
  raw: string;
  kind: "alias" | "group";
  /** Bare name: the alias, or the group id (without the "group:" prefix). */
  name: string;
}

/** A parsed #message-id reference. */
export interface IdPart {
  raw: string;
  id: number;
}

/** A run of plain text, a mention, or a message-id reference. */
export type Segment = string | MentionPart | IdPart;

/** Split text into ordered plain-text, mention, and #id segments. */
export function parseTokens(text: string): Segment[] {
  const out: Segment[] = [];
  const re = new RegExp(TOKEN_REGEX.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const token = m[1];
      const isGroup = token.startsWith("group:");
      out.push({ raw: m[0], kind: isGroup ? "group" : "alias", name: isGroup ? token.slice(6) : token });
    } else if (m[2] !== undefined) {
      out.push({ raw: m[0], id: parseInt(m[2], 10) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Handlers for the interactive tokens in a rendered message. */
export interface RenderOpts {
  /** Invoked with a bare alias when an @alias mention is clicked. */
  onAliasClick?: (alias: string) => void;
  /** Invoked with a message id when a #id reference is clicked. */
  onIdClick?: (id: number) => void;
}

/**
 * Render text with @mentions and #ids as Discord-style colored chips. Alias
 * mentions and #ids become clickable (keyboard-accessible) when the matching
 * handler is provided.
 */
export function renderMentions(text: string, opts: RenderOpts = {}): React.ReactNode[] {
  const { onAliasClick, onIdClick } = opts;
  return parseTokens(text).map((seg, i) => {
    if (typeof seg === "string") return <React.Fragment key={i}>{seg}</React.Fragment>;

    // #message-id reference
    if ("id" in seg) {
      const clickable = Boolean(onIdClick);
      return (
        <span
          key={i}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          title={clickable ? `Jump to message ${seg.raw}` : undefined}
          onClick={clickable ? (e) => { e.stopPropagation(); onIdClick!(seg.id); } : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onIdClick!(seg.id);
                  }
                }
              : undefined
          }
          className={cn(
            "rounded bg-zinc-700/40 px-1 font-mono text-zinc-300",
            clickable && "cursor-pointer hover:bg-zinc-600/60",
          )}
        >
          {seg.raw}
        </span>
      );
    }

    if (seg.kind === "group") {
      return (
        <span key={i} className="rounded bg-violet-500/15 px-1 font-medium text-violet-300">
          {seg.raw}
        </span>
      );
    }

    // @all is a broadcast to every member — distinct, not a clickable member.
    if (seg.name === "all") {
      return (
        <span key={i} className="rounded bg-amber-500/15 px-1 font-medium text-amber-300">
          {seg.raw}
        </span>
      );
    }

    const clickable = Boolean(onAliasClick);
    return (
      <span
        key={i}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        title={clickable ? `Show @${seg.name}'s join prompt` : undefined}
        onClick={clickable ? (e) => { e.stopPropagation(); onAliasClick!(seg.name); } : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onAliasClick!(seg.name);
                }
              }
            : undefined
        }
        className={cn(
          "rounded bg-indigo-500/15 px-1 font-medium text-indigo-300",
          clickable && "cursor-pointer hover:bg-indigo-500/30",
        )}
      >
        {seg.raw}
      </span>
    );
  });
}
