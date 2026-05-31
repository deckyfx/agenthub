import React, { useState } from "react";

interface Props {
  label: string;
  children: (close: () => void) => React.ReactNode;
}

/**
 * A button that expands into an inline form panel.
 * `children` receives a `close()` callback to collapse after submit.
 */
export function FormPanel({ label, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
      >
        {open ? "✕ Cancel" : `+ ${label}`}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700 space-y-2">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Simple labelled text input */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

/** Submit button for forms inside FormPanel */
export function SubmitBtn({ label, loading }: { label: string; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-1.5 rounded text-sm transition-colors"
    >
      {loading ? "…" : label}
    </button>
  );
}
