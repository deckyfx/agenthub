import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Shared UI primitives + theme tokens for the AgentHub dashboard.
 *
 * The palette is a calm "zinc + indigo" dark theme. Surfaces use zinc, the
 * primary accent is indigo, and message/status semantics use a small set of
 * jewel tones (sky/emerald/amber/rose/violet/cyan).
 */

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional lucide icon element rendered before the title. */
  icon?: React.ReactNode;
  /** Constrain width; defaults to a comfortable form width. */
  widthClass?: string;
  children: React.ReactNode;
}

/**
 * Modal dialog with a dimmed backdrop. Closes on Escape and backdrop click.
 * Replaces the old persistent inline forms.
 */
export function Dialog({ open, onClose, title, icon, widthClass = "max-w-md", children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Portal to <body> so the fixed overlay covers the full viewport regardless
  // of where it's rendered. (A transformed ancestor — e.g. the sliding sidebar —
  // would otherwise become the containing block and clamp the dialog to it.)
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-8"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "w-full rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 my-auto",
          widthClass,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-3.5">
          {icon && <span className="text-indigo-400">{icon}</span>}
          <h2 className="flex-1 text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500",
  secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:text-zinc-500",
  ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
  danger: "bg-rose-600/90 text-white hover:bg-rose-500 disabled:bg-zinc-800",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  full?: boolean;
}

/** Themed button with optional leading icon. */
export function Button({
  variant = "primary",
  icon,
  full,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        full && "w-full",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** Compact square icon-only button. */
export function IconButton({
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Form fields ──────────────────────────────────────────────────────────────

const INPUT_BASE =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40";

/** Field wrapper with a label. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export function TextInput({
  mono,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cn(INPUT_BASE, mono && "font-mono", className)} {...rest} />;
}

export function TextArea({
  mono,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      className={cn(INPUT_BASE, "resize-none", mono && "font-mono", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(INPUT_BASE, "cursor-pointer", className)} {...rest}>
      {children}
    </select>
  );
}

// ─── Per-sender color palette ───────────────────────────────────────────────

/** A coordinated set of classes for tinting a participant's UI. */
export interface SenderStyle {
  /** Avatar background + text. */
  avatar: string;
  /** Subtle bubble background tint. */
  bubble: string;
  /** Left accent border. */
  border: string;
  /** Alias text color. */
  text: string;
}

const SENDER_PALETTE: SenderStyle[] = [
  { avatar: "bg-sky-600 text-white", bubble: "bg-sky-500/[0.07]", border: "border-l-sky-500/60", text: "text-sky-300" },
  { avatar: "bg-emerald-600 text-white", bubble: "bg-emerald-500/[0.07]", border: "border-l-emerald-500/60", text: "text-emerald-300" },
  { avatar: "bg-amber-600 text-white", bubble: "bg-amber-500/[0.07]", border: "border-l-amber-500/60", text: "text-amber-300" },
  { avatar: "bg-violet-600 text-white", bubble: "bg-violet-500/[0.07]", border: "border-l-violet-500/60", text: "text-violet-300" },
  { avatar: "bg-rose-600 text-white", bubble: "bg-rose-500/[0.07]", border: "border-l-rose-500/60", text: "text-rose-300" },
  { avatar: "bg-cyan-600 text-white", bubble: "bg-cyan-500/[0.07]", border: "border-l-cyan-500/60", text: "text-cyan-300" },
  { avatar: "bg-fuchsia-600 text-white", bubble: "bg-fuchsia-500/[0.07]", border: "border-l-fuchsia-500/60", text: "text-fuchsia-300" },
  { avatar: "bg-lime-600 text-white", bubble: "bg-lime-500/[0.07]", border: "border-l-lime-500/60", text: "text-lime-300" },
  { avatar: "bg-teal-600 text-white", bubble: "bg-teal-500/[0.07]", border: "border-l-teal-500/60", text: "text-teal-300" },
  { avatar: "bg-orange-600 text-white", bubble: "bg-orange-500/[0.07]", border: "border-l-orange-500/60", text: "text-orange-300" },
];

/** The moderator gets a fixed indigo identity, distinct from agents. */
const MODERATOR_STYLE: SenderStyle = {
  avatar: "bg-indigo-600 text-white",
  bubble: "bg-indigo-500/[0.08]",
  border: "border-l-indigo-500/70",
  text: "text-indigo-300",
};

/** Stable hash so a given alias always maps to the same color. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Resolve a consistent color identity for a sender alias. */
export function senderStyle(alias: string): SenderStyle {
  if (alias === "moderator") return MODERATOR_STYLE;
  return SENDER_PALETTE[hashString(alias) % SENDER_PALETTE.length]!;
}
