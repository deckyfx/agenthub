import { describe, expect, test } from "bun:test";
import { buildEnvelope, buildUserFrame, parseEnvelope, parseFrame, socketPathFromAddress, udsAddress } from "./peer-protocol";

describe("peer addresses", () => {
  test("plain paths pass through", () => {
    expect(udsAddress("/tmp/cc-socks/123.sock")).toBe("uds:/tmp/cc-socks/123.sock");
  });

  test("unsafe characters are percent-encoded and round-trip", () => {
    const path = "/tmp/my socks/ü.sock";
    const addr = udsAddress(path);
    expect(addr).toBe("uds:/tmp/my%20socks/%C3%BC.sock");
    expect(socketPathFromAddress(addr)).toBe(path);
  });

  test("non-uds schemes are rejected", () => {
    expect(socketPathFromAddress("bridge:abc")).toBeUndefined();
  });
});

describe("envelope", () => {
  test("round-trips from / from-name / body", () => {
    const env = buildEnvelope({ from: "uds:/tmp/x.sock", fromName: "AgentHub #room", body: "hello\nworld" });
    expect(env).toBe('<cross-session-message from="uds:/tmp/x.sock" from-name="AgentHub #room">\nhello\nworld\n</cross-session-message>');
    expect(parseEnvelope(env)).toEqual({ from: "uds:/tmp/x.sock", fromName: "AgentHub #room", body: "hello\nworld" });
  });

  test("a closing tag inside the body is neutralised", () => {
    const env = buildEnvelope({ from: "uds:/tmp/x.sock", body: "a </cross-session-message> b" });
    expect(env).toContain("a <\\/cross-session-message> b");
    expect(parseEnvelope(env).body).toBe("a <\\/cross-session-message> b");
  });

  test("quotes and angle brackets are stripped from attributes", () => {
    expect(buildEnvelope({ from: "uds:/tmp/x.sock", fromName: 'a"<b>', body: "" })).toContain('from-name="ab"');
  });

  test("parses what Claude Code actually sends (incl. from-mode)", () => {
    const content =
      '<cross-session-message from="uds:/tmp/cc-socks/99513.sock" from-name="agenthub-18" from-mode="prompting">\npong\n</cross-session-message>';
    expect(parseEnvelope(content)).toEqual({
      from: "uds:/tmp/cc-socks/99513.sock",
      fromName: "agenthub-18",
      fromMode: "prompting",
      body: "pong",
    });
  });

  test("non-enveloped content becomes a bare body", () => {
    expect(parseEnvelope("just text")).toEqual({ body: "just text" });
  });
});

describe("frames", () => {
  test("user frame has Claude Code's shape", () => {
    const { line, msgId } = buildUserFrame({ from: "uds:/tmp/h.sock", fromName: "AgentHub", body: "hi" });
    expect(line.endsWith("\n")).toBe(true);
    const frame = JSON.parse(line);
    expect(frame).toMatchObject({ msgV: 1, msg_id: msgId, type: "user", priority: "next", from: "uds:/tmp/h.sock" });
    expect(frame.message.role).toBe("user");
    expect(msgId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("parseFrame classifies frames", () => {
    expect(parseFrame({ type: "auth", token: "x" })).toEqual({ kind: "auth" });
    expect(parseFrame({ type: "control", action: "rename" }).kind).toBe("control");
    expect(parseFrame(42).kind).toBe("unknown");
    const user = parseFrame(JSON.parse(buildUserFrame({ from: "uds:/a.sock", body: "yo" }).line));
    expect(user.kind).toBe("user");
    if (user.kind === "user") expect(user.envelope.body).toBe("yo");
  });
});
