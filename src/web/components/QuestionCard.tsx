import { useState } from "react";
import { Check, Circle, CircleDot, Loader2, MessageCircleQuestion, Send, Square, SquareCheck } from "lucide-react";
import { answersProblem, splitAnswer, type Answers, type AskQuestion, type QuestionStatus } from "../../core/questions";
import type { Result } from "../../lib/hub-store";
import { Button, cx, ErrorText, Input } from "./ui";

/** What the operator has picked so far for one question. */
interface Draft {
  picked: string[];
  other: string;
}

/** A draft as the answer string Claude Code would record (multi-select labels comma-joined). */
function draftAnswer(q: AskQuestion, d: Draft | undefined): string {
  if (!d) return "";
  const other = d.other.trim();
  if (!q.multiSelect) return other || (d.picked[0] ?? "");
  return [...d.picked, ...(other ? [other] : [])].join(", ");
}

const STATUS_BADGE: Record<QuestionStatus["state"], { text: string; className: string }> = {
  open: { text: "waiting for an answer", className: "bg-amber-500/15 text-amber-300" },
  answered: { text: "answered", className: "bg-emerald-500/15 text-emerald-300" },
  dismissed: { text: "dismissed", className: "bg-zinc-800 text-zinc-400" },
};

/** One option row: radio / checkbox look, selectable only while answering. */
function OptionRow({ label, description, multi, selected, disabled, onClick }: { label: string; description: string; multi: boolean; selected: boolean; disabled: boolean; onClick: () => void }) {
  const Icon = multi ? (selected ? SquareCheck : Square) : selected ? CircleDot : Circle;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
        selected ? "border-indigo-400/60 bg-indigo-500/10" : "border-zinc-800 bg-zinc-950/40",
        !disabled && !selected && "hover:border-zinc-600",
        disabled && !selected && "opacity-60",
      )}
    >
      <Icon className={cx("mt-0.5 size-3.5 shrink-0", selected ? "text-indigo-300" : "text-zinc-600")} />
      <span className="min-w-0">
        <span className={cx("block text-sm", selected ? "text-zinc-100" : "text-zinc-300")}>{label}</span>
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </span>
    </button>
  );
}

/**
 * An AskUserQuestion call. Shows the questions and options; once settled, the
 * chosen answers. While it is open and `onAnswer` is given, the operator can
 * answer it from here.
 */
export function QuestionCard({
  questions,
  status,
  onAnswer,
}: {
  questions: AskQuestion[];
  status: QuestionStatus;
  onAnswer?: (answers: Answers) => Promise<Result>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const answering = status.state === "open" && onAnswer !== undefined;

  const update = (q: AskQuestion, fn: (d: Draft) => Draft) => {
    setError("");
    setDrafts((all) => ({ ...all, [q.question]: fn(all[q.question] ?? { picked: [], other: "" }) }));
  };
  const pick = (q: AskQuestion, label: string) =>
    update(q, (d) =>
      q.multiSelect
        ? { ...d, picked: d.picked.includes(label) ? d.picked.filter((l) => l !== label) : [...d.picked, label] }
        : { picked: [label], other: "" },
    );

  const answers: Answers = Object.fromEntries(questions.map((q) => [q.question, draftAnswer(q, drafts[q.question])]));
  const incomplete = answersProblem(questions, answers);

  const send = async () => {
    if (!onAnswer || incomplete) return;
    setSending(true);
    const res = await onAnswer(answers);
    setSending(false);
    if (!res.ok) setError(res.error);
  };

  const badge = STATUS_BADGE[status.state];
  return (
    <div className={cx("my-1.5 rounded-lg border p-3", status.state === "open" ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/40")}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <MessageCircleQuestion className="size-3.5 text-amber-300" />
        <span className="font-medium text-zinc-300">Claude asked</span>
        <span className={cx("rounded px-1.5 py-0.5", badge.className)}>{badge.text}</span>
        {status.state === "answered" && <span className="text-zinc-500">{status.via === "hub" ? "from AgentHub" : "in the session"}</span>}
      </div>

      <div className="space-y-3">
        {questions.map((q) => {
          // Answered: show what was chosen. Answering: show the live draft.
          const settled = status.state === "answered" ? splitAnswer(q, status.answers[q.question] ?? "") : undefined;
          const draft = drafts[q.question];
          const picked = settled ? settled.picked : new Set(draft?.picked ?? []);
          const other = settled ? settled.other : (draft?.other ?? "");
          return (
            <div key={q.question}>
              <div className="mb-1.5 flex items-baseline gap-2">
                {q.header && <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300">{q.header}</span>}
                <p className="text-sm text-zinc-100">{q.question}</p>
                {q.multiSelect && <span className="shrink-0 text-[11px] text-zinc-500">pick any</span>}
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {q.options.map((o) => (
                  <OptionRow
                    key={o.label}
                    label={o.label}
                    description={o.description}
                    multi={q.multiSelect}
                    selected={picked.has(o.label) && !(answering && !q.multiSelect && other.trim())}
                    disabled={!answering || sending}
                    onClick={() => pick(q, o.label)}
                  />
                ))}
              </div>
              {answering ? (
                <Input
                  className="mt-1 py-1 text-sm"
                  placeholder="Other: type your own answer"
                  value={other}
                  disabled={sending}
                  onChange={(e) => update(q, (d) => ({ ...d, other: e.target.value }))}
                />
              ) : (
                other && (
                  <p className="mt-1 flex items-start gap-1.5 rounded-md border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1.5 text-sm text-zinc-100">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-indigo-300" /> {other}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>

      {status.state === "dismissed" && <p className="mt-2 text-xs text-zinc-500">{status.reason || "The question was closed without an answer."}</p>}
      {status.state === "open" && !onAnswer && <p className="mt-2 text-xs text-zinc-500">Waiting for the session's user to answer.</p>}
      {answering && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-2.5">
          <p className="min-w-0 flex-1 text-xs text-zinc-500">
            Sending interrupts the session: its question dialog closes and your answers arrive as a message from AgentHub. The agent may still check
            with its user before doing anything risky.
          </p>
          <Button variant="primary" disabled={!!incomplete || sending} title={incomplete} onClick={() => void send()}>
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send answers
          </Button>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
