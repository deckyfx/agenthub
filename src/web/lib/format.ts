/** `14:03` today, `Oct 27 14:03` otherwise. */
export function clock(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

/** Compact relative time (`12s`, `4m`, `3h`, `2d`). */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

/** `/Users/me/code/app` → `~/code/app`. */
export function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
}

/** Stable colour class for a sender label. */
const PALETTE = ["text-sky-400", "text-emerald-400", "text-amber-400", "text-fuchsia-400", "text-rose-400", "text-teal-400", "text-violet-400", "text-lime-400"];
export function senderColor(label: string): string {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? "text-zinc-300";
}
