import React, { useEffect, useRef, useState } from "react";
import { Palette, Check, Sun, Moon } from "lucide-react";
import { cn } from "./ui";
import { ACCENTS, getAccent, getMode, applyAccent, applyMode, type Mode } from "../lib/theme";

/**
 * Theme picker with two independent axes: accent hue and dark/light mode.
 * Selections apply `data-accent` / `data-mode` to <html> and persist. Keyboard
 * accessible: the trigger is a real button with aria-expanded, the accent list
 * uses menuitemradio semantics, the mode toggle uses aria-pressed, and the
 * popover closes on Escape or outside click.
 */
export function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const [accent, setAccent] = useState(getAccent);
  const [mode, setMode] = useState<Mode>(getMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while open (DOM side-effects).
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickAccent(id: string) {
    applyAccent(id);
    setAccent(id);
  }
  function pickMode(m: Mode) {
    applyMode(m);
    setMode(m);
  }

  const active = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0]!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Change theme (accent: ${active.label}, mode: ${mode})`}
        title="Change theme"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100",
          collapsed && "md:justify-center md:px-0",
        )}
      >
        <Palette size={16} className="shrink-0" />
        <span className={cn("flex-1 text-left", collapsed && "md:hidden")}>Theme</span>
        <span
          className={cn("h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20", collapsed && "md:hidden")}
          style={{ background: active.swatch }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className={cn(
            "absolute z-30 w-52 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 p-2 shadow-xl",
            "bottom-full left-0 mb-1",
            collapsed && "md:bottom-0 md:left-full md:mb-0 md:ml-2",
          )}
        >
          {/* Accent axis */}
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Accent</p>
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                role="menuitemradio"
                aria-checked={a.id === accent}
                aria-label={a.label}
                title={a.label}
                onClick={() => pickAccent(a.id)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md ring-2 transition-all",
                  a.id === accent ? "ring-white/70" : "ring-transparent hover:ring-white/30",
                )}
                style={{ background: a.swatch }}
              >
                {a.id === accent && <Check size={14} className="text-white drop-shadow" />}
              </button>
            ))}
          </div>

          {/* Mode axis */}
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Mode</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              aria-pressed={mode === "dark"}
              onClick={() => pickMode("dark")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "dark" ? "bg-indigo-600 text-white" : "bg-zinc-700/60 text-zinc-300 hover:bg-zinc-700",
              )}
            >
              <Moon size={13} /> Dark
            </button>
            <button
              aria-pressed={mode === "light"}
              onClick={() => pickMode("light")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "light" ? "bg-indigo-600 text-white" : "bg-zinc-700/60 text-zinc-300 hover:bg-zinc-700",
              )}
            >
              <Sun size={13} /> Light
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
