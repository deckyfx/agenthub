import { X } from "lucide-react";
import { hubStore, useHub } from "../lib/store";
import { cx } from "./ui";

/** Bottom-right toasts for hub notices and action errors. */
export function Notices() {
  const notices = useHub((s) => s.notices);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-96 flex-col gap-2">
      {notices.map((n) => (
        <div
          key={n.id}
          className={cx(
            "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg",
            n.level === "warn" ? "border-amber-500/30 bg-zinc-900 text-amber-200" : "border-zinc-700 bg-zinc-900 text-zinc-200",
          )}
        >
          <p className="flex-1">{n.text}</p>
          <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => hubStore.getState().dismiss(n.id)} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
