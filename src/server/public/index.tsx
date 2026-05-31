import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { api } from "./lib/api";
import { OverviewPage } from "./pages/OverviewPage";
import { ChannelPage } from "./pages/ChannelPage";
import { AgentPage } from "./pages/AgentPage";
import type { Channel } from "../../db/schema";

type Page =
  | { view: "overview" }
  | { view: "channel"; id: string }
  | { view: "agent"; id: string };

function App() {
  const [page, setPage] = useState<Page>({ view: "overview" });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Array<{ id: string; status: string }>>([]);

  useEffect(() => {
    async function fetchNav() {
      const [chRes, agRes] = await Promise.all([
        api.api.channels.get(),
        api.api.agents.get(),
      ]);
      if (chRes.data?.channels) setChannels(chRes.data.channels);
      if (agRes.data?.agents) setAgents(agRes.data.agents);
    }
    fetchNav();
    const interval = setInterval(fetchNav, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <p className="font-bold text-white text-sm">🤖 AgentHub</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 text-sm">
          <NavItem active={page.view === "overview"} onClick={() => setPage({ view: "overview" })}>Overview</NavItem>

          {channels.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-600 px-2 mb-1 uppercase tracking-wide">Channels</p>
              {channels.map((ch) => (
                <NavItem
                  key={ch.id}
                  active={page.view === "channel" && (page as { view: "channel"; id: string }).id === ch.id}
                  onClick={() => setPage({ view: "channel", id: ch.id })}
                >
                  <span className="font-mono">{ch.id}</span>
                </NavItem>
              ))}
            </div>
          )}

          {agents.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-600 px-2 mb-1 uppercase tracking-wide">Agents</p>
              {agents.map((a) => (
                <NavItem
                  key={a.id}
                  active={page.view === "agent" && (page as { view: "agent"; id: string }).id === a.id}
                  onClick={() => setPage({ view: "agent", id: a.id })}
                >
                  <span className="font-mono text-xs">{a.id}</span>
                </NavItem>
              ))}
            </div>
          )}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        {page.view === "overview" && <OverviewPage onSelectChannel={(id) => setPage({ view: "channel", id })} />}
        {page.view === "channel" && (
          <ChannelPage
            channelId={(page as { view: "channel"; id: string }).id}
            onBack={() => setPage({ view: "overview" })}
          />
        )}
        {page.view === "agent" && (
          <AgentPage
            agentId={(page as { view: "agent"; id: string }).id}
            onBack={() => setPage({ view: "overview" })}
          />
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
        active ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<App />);
