/**
 * Theme registry + persistence for the dashboard.
 *
 * Theming has two independent axes, applied as attributes on <html> and
 * re-skinned by styles.css:
 *   - accent  → `data-accent` (the brand/accent hue)
 *   - mode    → `data-mode`   (dark vs light surfaces)
 *
 * The defaults (indigo accent, dark mode) use no attribute at all.
 */

/** A selectable accent hue. */
export interface Accent {
  /** Stable id, written to `data-accent` + localStorage. */
  id: string;
  /** Human label. */
  label: string;
  /** Representative swatch color. */
  swatch: string;
}

export const ACCENTS: Accent[] = [
  { id: "indigo", label: "Indigo", swatch: "#6366f1" },
  { id: "emerald", label: "Emerald", swatch: "#10b981" },
  { id: "violet", label: "Violet", swatch: "#8b5cf6" },
  { id: "amber", label: "Amber", swatch: "#f59e0b" },
];

/** Surface mode. */
export type Mode = "dark" | "light";

const ACCENT_KEY = "agenthub:accent";
const MODE_KEY = "agenthub:mode";
const DEFAULT_ACCENT = "indigo";
const DEFAULT_MODE: Mode = "dark";

/** Read the persisted accent id (falls back to the default). */
export function getAccent(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/** Read the persisted mode (falls back to dark). */
export function getMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "light" ? "light" : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Apply an accent to the document and persist it. */
export function applyAccent(id: string): void {
  const root = document.documentElement;
  if (id === DEFAULT_ACCENT) delete root.dataset.accent;
  else root.dataset.accent = id;
  try {
    localStorage.setItem(ACCENT_KEY, id);
  } catch {
    /* storage unavailable (private mode) — still applies for this session */
  }
}

/** Apply a surface mode to the document and persist it. */
export function applyMode(mode: Mode): void {
  const root = document.documentElement;
  if (mode === DEFAULT_MODE) delete root.dataset.mode;
  else root.dataset.mode = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}
