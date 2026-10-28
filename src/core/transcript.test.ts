import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEST_ROOT } from "../test-setup";
import { findTranscript, listSubagents, parseRecord, readHistory, subagentTranscript, TranscriptTail, type ChatEntry } from "./transcript";

// Record shapes as Claude Code 2.1.31x writes them (trimmed).
const human = {
  type: "user",
  uuid: "u1",
  timestamp: "2026-10-28T02:31:59.359Z",
  origin: { kind: "human" },
  message: { role: "user", content: [{ type: "text", text: "fix the build<system-reminder>noise</system-reminder>" }] },
};
const assistant = {
  type: "assistant",
  uuid: "a1",
  timestamp: "2026-10-28T02:32:03.369Z",
  message: {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "let me look" },
      { type: "text", text: "Looking now." },
      { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "bun test", description: "Run tests" } },
    ],
  },
};
const toolResult = {
  type: "user",
  uuid: "r1",
  timestamp: "2026-10-28T02:32:08.176Z",
  message: { role: "user", content: [{ tool_use_id: "toolu_1", type: "tool_result", content: "29 pass", is_error: false }] },
};
const peerQueued = {
  type: "attachment",
  uuid: "q1",
  timestamp: "2026-10-28T02:49:32.850Z",
  attachment: {
    type: "queued_command",
    prompt: '<cross-session-message from="uds:/tmp/h.sock" from-name="AgentHub">\nping\n</cross-session-message>',
    origin: { kind: "peer", from: "uds:/tmp/h.sock", name: "AgentHub", body: "ping" },
  },
};

describe("parseRecord", () => {
  test("human prompt, harness wrappers stripped", () => {
    expect(parseRecord(human)).toEqual([{ kind: "prompt", id: "u1:0", ts: Date.parse(human.timestamp), source: "human", text: "fix the build" }]);
  });

  test("assistant blocks → thinking, text, tool with summary", () => {
    const [thinking, text, tool] = parseRecord(assistant);
    expect(thinking).toMatchObject({ kind: "thinking", text: "let me look" });
    expect(text).toMatchObject({ kind: "text", text: "Looking now." });
    expect(tool).toMatchObject({ kind: "tool", id: "toolu_1", name: "Bash", summary: "Run tests" });
  });

  test("tool_result links back to its tool_use", () => {
    expect(parseRecord(toolResult)).toEqual([
      { kind: "result", id: "r1:0", ts: Date.parse(toolResult.timestamp), toolUseId: "toolu_1", text: "29 pass", isError: false },
    ]);
  });

  test("peer message queued mid-turn", () => {
    expect(parseRecord(peerQueued)).toEqual([{ kind: "prompt", id: "q1", ts: Date.parse(peerQueued.timestamp), source: "peer", from: "AgentHub", text: "ping" }]);
  });

  test("meta, sidechain and bookkeeping records are skipped", () => {
    expect(parseRecord({ ...human, isMeta: true })).toEqual([]);
    expect(parseRecord({ ...assistant, isSidechain: true })).toEqual([]);
    expect(parseRecord({ ...assistant, isSidechain: true }, { sidechain: true })).toHaveLength(3);
    expect(parseRecord({ type: "queue-operation", operation: "enqueue" })).toEqual([]);
    expect(parseRecord("garbage")).toEqual([]);
  });

  test("huge tool output is clipped", () => {
    const big = { ...toolResult, message: { role: "user", content: [{ tool_use_id: "t", type: "tool_result", content: "x".repeat(10_000) }] } };
    const [r] = parseRecord(big);
    expect(r?.kind === "result" && r.text.length < 4100).toBe(true);
  });
});

const PROJECTS = join(TEST_ROOT, "claude", "projects");
const CWD = "/work/my.app";
const SID = "11111111-2222-3333-4444-555555555555";
const projectDir = join(PROJECTS, "-work-my-app");
const mainPath = join(projectDir, `${SID}.jsonl`);
const line = (rec: unknown) => `${JSON.stringify(rec)}\n`;

describe("transcript files", () => {
  test("found via cwd encoding, history parsed", async () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(mainPath, line(human) + line(assistant) + line(toolResult));
    expect(await findTranscript(SID, CWD)).toBe(mainPath);
    expect(await findTranscript(SID)).toBe(mainPath); // glob fallback
    expect((await readHistory(mainPath)).map((e) => e.kind)).toEqual(["prompt", "thinking", "text", "tool", "result"]);
  });

  test("tail emits only complete appended lines", async () => {
    const tail = new TranscriptTail("t", async () => mainPath);
    const got: ChatEntry[] = [];
    tail.on("entries", (e) => got.push(...e));
    await tail.start();
    const half = line(peerQueued);
    appendFileSync(mainPath, half.slice(0, 20)); // torn write
    await Bun.sleep(1300);
    expect(got).toHaveLength(0);
    appendFileSync(mainPath, half.slice(20));
    const end = Date.now() + 3000;
    while (got.length === 0 && Date.now() < end) await Bun.sleep(50);
    tail.stop();
    expect(got).toEqual(parseRecord(peerQueued));
  });

  test("subagents are listed from meta + transcript", async () => {
    const dir = join(projectDir, SID, "subagents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agent-abc123.jsonl"), line({ ...assistant, isSidechain: true }));
    writeFileSync(join(dir, "agent-abc123.meta.json"), JSON.stringify({ agentType: "Explore", description: "Find the bug", requestShape: "background" }));
    const subs = await listSubagents(mainPath);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ agentId: "abc123", agentType: "Explore", description: "Find the bug", background: true, active: true });

    const path = subagentTranscript(mainPath, "abc123");
    expect(path).toBe(join(dir, "agent-abc123.jsonl"));
    expect((await readHistory(path ?? "")).map((e) => e.kind)).toEqual(["thinking", "text", "tool"]); // sidechain kept
    expect(subagentTranscript(mainPath, "../../etc")).toBeUndefined();
  });
});
