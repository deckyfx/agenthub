import React from "react";

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-gray-600 text-gray-200",
  working: "bg-blue-600 text-blue-100",
  waiting: "bg-yellow-600 text-yellow-100",
  blocked: "bg-red-700 text-red-100",
  done: "bg-green-700 text-green-100",
  pending: "bg-gray-600 text-gray-200",
  in_progress: "bg-blue-600 text-blue-100",
  failed: "bg-red-700 text-red-100",
  read: "bg-indigo-700 text-indigo-100",
};

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-700 text-gray-300";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}
