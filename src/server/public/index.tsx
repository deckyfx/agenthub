import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Boxes, LayoutGrid, Hash, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { OverviewPage } from "./pages/OverviewPage";
import { ChannelPage } from "./pages/ChannelPage";
import { cn } from "./components/ui";
import { useHub } from "./lib/store";

type Page = { view: "overview" } | { view: "channel"; id: string };

function App() {
  const [page, setPage] = useState<Page>({ view: "overview" });
  const channels = useHub((s) => s.channels);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("agenthub:sidebar") === "collapsed",
  );

  function toggle() {
    setCollapsed((v) => {
      localStorage.setItem("agenthub:sidebar", v ? "expanded" : "collapsed");
      return !v;
    });
  }

  const activeChannel = page.view === "channel" ? page.id : null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-[width] duration-200",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-zinc-800 px-3 py-3.5", collapsed && "justify-center px-0")}>
          <Boxes size={20} className="shrink-0 text-indigo-400" />
          {!collapsed && <span className="flex-1 text-sm font-bold">AgentHub</span>}
          {!collapsed && (
            <button onClick={toggle} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Collapse">
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>

        {collapsed && (
          <button onClick={toggle} className="mx-auto mt-2 rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Expand">
            <PanelLeftOpen size={16} />
          </button>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <NavItem
            icon={<LayoutGrid size={16} />}
            label="Overview"
            collapsed={collapsed}
            active={page.view === "overview"}
            onClick={() => setPage({ view: "overview" })}
          />

          {channels.length > 0 && !collapsed && (
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Channels
            </p>
          )}
          {channels.length > 0 && collapsed && <div className="my-2 border-t border-zinc-800" />}

          {channels.map((ch) => (
            <NavItem
              key={ch.id}
              icon={<Hash size={16} />}
              label={ch.id}
              mono
              collapsed={collapsed}
              active={activeChannel === ch.id}
              onClick={() => setPage({ view: "channel", id: ch.id })}
            />
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-hidden p-6">
        {page.view === "overview" && (
          <OverviewPage onSelectChannel={(id) => setPage({ view: "channel", id })} />
        )}
        {page.view === "channel" && (
          <ChannelPage channelId={page.id} onBack={() => setPage({ view: "overview" })} />
        )}
      </main>
    </div>
  );
}

function NavItem({
  icon, label, active, onClick, collapsed, mono,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  mono?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-indigo-600/15 text-indigo-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className={cn("flex-1 truncate text-left", mono && "font-mono text-xs")}>{label}</span>}
    </button>
  );
}

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<App />);
