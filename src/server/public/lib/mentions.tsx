import React from "react";
import { cn } from "../components/ui";

/**
 * Shared parsing/rendering for @mentions, used by both the composer's live
 * highlight overlay and the message feed. Centralizing the pattern keeps the
 * two in sync.
 *
 * Recognized forms:
 *   - `@alias`        → a channel member
 *   - `@group:<id>`   → a group
 */
export const MENTION_REGEX = /@([\w-]+(?::[\w-]+)?)/g;

/** A parsed @mention token. */
export interface MentionPart {
  /** Raw matched text including the leading "@" (e.g. "@bob", "@group:crm"). */
  raw: string;
  /** Whether this targets a group or an individual alias. */
  kind: "alias" | "group";
  /** Bare name: the alias, or the group id (without the "group:" prefix). */
  name: string;
}

/** A run of plain text, or a parsed mention. */
export type Segment = string | MentionPart;

/** Split text into ordered plain-text and mention segments. */
export function parseMentions(text: string): Segment[] {
  const out: Segment[] = [];
  const re = new RegExp(MENTION_REGEX.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[1] ?? "";
    const isGroup = token.startsWith("group:");
    out.push({ raw: m[0], kind: isGroup ? "group" : "alias", name: isGroup ? token.slice(6) : token });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Render text with @mentions styled as Discord-style colored chips. Alias
 * mentions become clickable (keyboard-accessible) when `onAliasClick` is given.
 *
 * @param text - The raw message text.
 * @param onAliasClick - Optional handler invoked with the bare alias on click.
 */
export function renderMentions(
  text: string,
  onAliasClick?: (alias: string) => void,
): React.ReactNode[] {
  return parseMentions(text).map((seg, i) => {
    if (typeof seg === "string") return <React.Fragment key={i}>{seg}</React.Fragment>;

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
