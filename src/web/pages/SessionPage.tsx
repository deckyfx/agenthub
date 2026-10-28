import { useCallback, useState } from "react";
import { Bot, MessagesSquare, Radio, Square, Terminal } from "lucide-react";
import { chatKey } from "../../core/chat-key";
import type { SubagentInfo } from "../../core/transcript";
import { hubStore, useHub } from "../lib/store";
import { ago, tildify } from "../lib/format";
import { ChatView } from "../components/ChatView";
import { Composer } from "../components/Composer";
import { Feed } from "../components/Feed";
import { Button, cx, Select, StatusDot } from "../components/ui";

type Tab = "live" | "hub";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm", active ? "border-indigo-400 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300")}
    >
      {children}
    </button>
  );
}

/** Subagents the session launched; click one to watch its own live chat. */
function SubagentStrip({ subagents, selected }: { subagents: SubagentInfo[]; selected: string | null }) {
  const active = subagents.filter((a) => a.active).length;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800 px-4 py-1.5">
      <span className="shrink-0 text-xs text-zinc-500">
        <Bot className="mr-1 inline size-3.5" />
        {subagents.length} subagents{active ? ` · ${active} active` : ""}
      </span>
      <button
        type="button"
        onClick={() => hubStore.getState().selectAgent(null)}
        className={cx("shrink-0 rounded px-2 py-0.5 text-xs", selected === null ? "bg-indigo-500/20 text-indigo-200" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200")}
      >
        main
      </button>
      {subagents.slice(0, 40).map((a) => (
        <button
          key={a.agentId}
          type="button"
          title={`${a.agentType} · ${a.agentId}${a.background ? " · background" : ""}\nlast write ${ago(a.updatedAt)} ago`}
          onClick={() => hubStore.getState().selectAgent(a.agentId)}
          className={cx(
            "flex max-w-56 shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-xs",
            selected === a.agentId ? "bg-indigo-500/20 text-indigo-200" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200",
          )}
        >
          <StatusDot status={a.active ? "busy" : "idle"} online={a.active} />
          <span className="truncate">{a.description || a.agentType}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * One session: its live conversation (streamed from the transcript), its
 * subagents, and the operator's direct hub thread.
 */
export function SessionPage({ sessionId }: { sessionId: string }) {
  const session = useHub((s) => s.sessions.find((x) => x.sessionId === sessionId));
  const rooms = useHub((s) => s.rooms);
  const messages = useHub((s) => s.threads[`dm:${sessionId}`]);
  const subagents = useHub((s) => s.subagents[sessionId]) ?? [];
  const selectedAgent = useHub((s) => s.selectedAgent);
  const chat = useHub((s) => s.transcripts[chatKey(sessionId, selectedAgent ?? undefined)]);
  const [tab, setTab] = useState<Tab>("live");
  const [room, setRoom] = useState("");
  const names = useCallback(() => session?.name ?? "session", [session]);
  const memberOf = rooms.filter((r) => r.members.some((m) => m.sessionId === sessionId));
  const joinable = rooms.filter((r) => !memberOf.includes(r));
  const agent = subagents.find((a) => a.agentId === selectedAgent);

  const join = async () => {
    if (!room) return;
    const res = await hubStore.getState().addMember(room, sessionId);
    if (!res.ok) return hubStore.getState().notify("warn", res.error);
    setRoom("");
  };

  const stop = async () => {
    if (!session || !window.confirm(`Stop background session ${session.name}? Its conversation is kept.`)) return;
    const res = await hubStore.getState().stopSession(session.pid);
    if (!res.ok) hubStore.getState().notify("warn", res.error);
  };

  const stopAgent = async () => {
    if (!agent || !window.confirm(`Ask ${session?.name ?? "the session"} to stop subagent "${agent.description || agent.agentId}"?`)) return;
    const res = await hubStore.getState().relayToSubagent(sessionId, agent.agentId, "stop");
    hubStore.getState().notify(res.ok ? "info" : "warn", res.ok ? "Stop request sent to the parent session" : res.error);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
        <StatusDot status={session?.status} online={!!session} />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-zinc-100">{session?.name ?? "Offline session"}</h1>
          {session ? (
            <p className="truncate text-xs text-zinc-500">
              {tildify(session.cwd)} · pid {session.pid} · {session.kind === "bg" ? "background" : session.entrypoint} · {session.status} {ago(session.statusUpdatedAt)} · v{session.version}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Not running. Messages queue until it comes back.</p>
          )}
        </div>
        {memberOf.map((r) => (
          <a key={r.id} href={`#/room/${r.id}`} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700">
            #{r.id}
          </a>
        ))}
        {joinable.length > 0 && session && (
          <div className="flex items-center gap-1.5">
            <Select className="w-40 py-1" value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">Add to room…</option>
              {joinable.map((r) => (
                <option key={r.id} value={r.id}>#{r.id}</option>
              ))}
            </Select>
            <Button disabled={!room} onClick={() => void join()}>Add</Button>
          </div>
        )}
        {session?.jobId && (
          <>
            <code className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400" title="Attach in a terminal">
              <Terminal className="size-3" /> claude attach {session.jobId}
            </code>
            <Button variant="danger" onClick={() => void stop()}>
              <Square className="size-3.5" /> Stop
            </Button>
          </>
        )}
      </header>

      <nav className="flex border-b border-zinc-800 px-2">
        <TabButton active={tab === "live"} onClick={() => setTab("live")}>
          <Radio className="size-3.5" /> Live
        </TabButton>
        <TabButton active={tab === "hub"} onClick={() => setTab("hub")}>
          <MessagesSquare className="size-3.5" /> Hub messages
        </TabButton>
      </nav>

      {tab === "live" ? (
        <>
          {subagents.length > 0 && <SubagentStrip subagents={subagents} selected={selectedAgent} />}
          {agent && (
            <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-4 py-1.5 text-xs text-zinc-400">
              <Bot className="size-3.5" />
              <span className="font-medium text-zinc-200">{agent.description || agent.agentId}</span>
              <span>{agent.agentType} · {agent.background ? "background" : "foreground"} · {agent.active ? "active" : `quiet ${ago(agent.updatedAt)}`}</span>
              <Button variant="ghost" className="ml-auto py-0.5" onClick={() => void stopAgent()}>
                <Square className="size-3" /> Ask parent to stop
              </Button>
            </div>
          )}
          <ChatView
            key={selectedAgent ?? "main"}
            entries={chat}
            busy={agent ? agent.active : session?.status === "busy"}
            empty={agent ? "This subagent hasn't written anything yet." : "No transcript yet. It appears once the session's first turn starts."}
            // Only a live session's own questions can be answered (subagents have no dialog to close).
            onAnswer={session && !agent ? (toolUseId, answers) => hubStore.getState().answerQuestion(sessionId, toolUseId, answers) : undefined}
          />
          {agent ? (
            <Composer
              onSend={(body) => hubStore.getState().relayToSubagent(sessionId, agent.agentId, "message", body)}
              placeholder={`Ask ${session?.name ?? "the parent"} to relay a message to this subagent`}
            />
          ) : (
            <Composer thread={{ kind: "session", sessionId }} placeholder={`Message ${session?.name ?? "session"} (lands in its next turn)`} />
          )}
        </>
      ) : (
        <>
          <Feed messages={messages} names={names} empty="No hub messages yet. What you send lands in this session's next turn." />
          <Composer thread={{ kind: "session", sessionId }} placeholder={`Message ${session?.name ?? "session"} directly`} />
        </>
      )}
    </section>
  );
}
