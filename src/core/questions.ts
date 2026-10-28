/**
 * Claude Code's AskUserQuestion tool, as seen from outside the session:
 * the questions in its tool input, the answers in its result, and the hub
 * message that answers a question still open in the session's dialog.
 *
 * Browser-safe (no Bun / node imports): the web and TUI render with it too.
 */

import { catchSync } from "../lib/error-handler";
import type { ChatEntry } from "./transcript";

/** Name of the tool in transcripts. */
export const ASK_TOOL = "AskUserQuestion";

/** One choice of a question. */
export interface AskOption {
  label: string;
  description: string;
}

/** One question of an AskUserQuestion call. */
export interface AskQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskOption[];
}

/** Question text → chosen label(s) (comma-separated for multi-select) or free text. */
export type Answers = Record<string, string>;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The questions in an AskUserQuestion tool input, or undefined if it isn't one. */
export function parseQuestions(input: unknown): AskQuestion[] | undefined {
  if (!isObj(input) || !Array.isArray(input.questions)) return undefined;
  const questions = input.questions.filter(isObj).map(
    (q): AskQuestion => ({
      question: str(q.question),
      header: str(q.header),
      multiSelect: q.multiSelect === true,
      options: (Array.isArray(q.options) ? q.options : []).filter(isObj).map((o) => ({ label: str(o.label), description: str(o.description) })),
    }),
  );
  return questions.length > 0 && questions.every((q) => q.question) ? questions : undefined;
}

/** The answers recorded with an AskUserQuestion result (`toolUseResult.answers`). */
export function parseAnswers(toolUseResult: unknown): Answers | undefined {
  if (!isObj(toolUseResult) || !isObj(toolUseResult.answers)) return undefined;
  const answers: Answers = {};
  for (const [q, a] of Object.entries(toolUseResult.answers)) if (typeof a === "string") answers[q] = a;
  return answers;
}

/**
 * Why a set of answers can't be sent, or undefined when every question has a
 * non-empty answer and nothing else is answered.
 */
export function answersProblem(questions: AskQuestion[], answers: Answers): string | undefined {
  const asked = new Set(questions.map((q) => q.question));
  const stray = Object.keys(answers).find((q) => !asked.has(q));
  if (stray !== undefined) return `"${stray}" is not one of the questions`;
  const missing = questions.find((q) => !answers[q.question]?.trim());
  return missing ? `"${missing.header || missing.question}" has no answer` : undefined;
}

const ANSWER_HEAD = /^Answers to your AskUserQuestion \(([\w-]+)\)/;
const ANSWER_LINE = /^- ("(?:[^"\\]|\\.)*") = ("(?:[^"\\]|\\.)*")$/;

/**
 * The hub message that answers an open question. It interrupts the session
 * (its dialog closes, the tool call ends as rejected) and arrives as the next
 * prompt, so it says plainly what happened. Questions and answers are JSON
 * strings so {@link parseAnswerMessage} can read them back.
 */
export function formatAnswerMessage(toolUseId: string, questions: AskQuestion[], answers: Answers): string {
  return [
    `Answers to your AskUserQuestion (${toolUseId}), sent by the operator from the AgentHub dashboard.`,
    "Your question dialog was closed when this message arrived, so the tool call shows as rejected. These are the answers:",
    ...questions.map((q) => `- ${JSON.stringify(q.question)} = ${JSON.stringify(answers[q.question] ?? "")}`),
    "Continue with these answers in mind.",
  ].join("\n");
}

/** Read back a {@link formatAnswerMessage} body, or undefined for any other text. */
export function parseAnswerMessage(body: string): { toolUseId: string; answers: Answers } | undefined {
  const lines = body.trim().split("\n");
  const head = ANSWER_HEAD.exec(lines[0] ?? "");
  if (!head?.[1]) return undefined;
  const answers: Answers = {};
  for (const line of lines) {
    const m = ANSWER_LINE.exec(line);
    if (!m?.[1] || !m[2]) continue;
    const [qErr, q] = catchSync((): unknown => JSON.parse(m[1] ?? ""));
    const [aErr, a] = catchSync((): unknown => JSON.parse(m[2] ?? ""));
    // A line that only looks like an answer is skipped.
    if (!qErr && !aErr && typeof q === "string" && typeof a === "string") answers[q] = a;
  }
  return { toolUseId: head[1], answers };
}

/** Where a question stands, as far as the transcript shows. */
export type QuestionStatus =
  | { state: "open" }
  | { state: "answered"; answers: Answers; via: "session" | "hub" }
  | { state: "dismissed"; reason: string };

/**
 * The status of every question in a chat, keyed by tool use id. An answer
 * sent from the hub wins over the rejected result its interrupt leaves.
 */
export function questionStatuses(entries: readonly ChatEntry[]): Map<string, QuestionStatus> {
  const results = new Map<string, Extract<ChatEntry, { kind: "result" }>>();
  const fromHub = new Map<string, Answers>();
  for (const e of entries) {
    if (e.kind === "result") results.set(e.toolUseId, e);
    else if (e.kind === "prompt" && e.answersFor) fromHub.set(e.answersFor.toolUseId, e.answersFor.answers);
  }
  const out = new Map<string, QuestionStatus>();
  for (const e of entries) {
    if (e.kind !== "question") continue;
    const hub = fromHub.get(e.id);
    const result = results.get(e.id);
    if (hub) out.set(e.id, { state: "answered", answers: hub, via: "hub" });
    else if (result?.answers) out.set(e.id, { state: "answered", answers: result.answers, via: "session" });
    else if (result) out.set(e.id, { state: "dismissed", reason: (result.text.split("\n")[0] ?? "").slice(0, 160) });
    else out.set(e.id, { state: "open" });
  }
  return out;
}

/** The option labels an answer picked (multi-select answers are comma-joined); the rest is free text. */
export function splitAnswer(question: AskQuestion, answer: string): { picked: Set<string>; other: string } {
  const labels = new Set(question.options.map((o) => o.label));
  if (labels.has(answer)) return { picked: new Set([answer]), other: "" };
  if (!question.multiSelect) return { picked: new Set(), other: answer };
  const parts = answer.split(", ");
  return { picked: new Set(parts.filter((p) => labels.has(p))), other: parts.filter((p) => !labels.has(p)).join(", ") };
}
