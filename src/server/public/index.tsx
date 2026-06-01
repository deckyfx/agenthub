import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Boxes, LayoutGrid, Hash, PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";
import { OverviewPage } from "./pages/OverviewPage";
import { ChannelPage } from "./pages/ChannelPage";
import { cn } from "./components/ui";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { MembersPanel } from "./components/channel/MembersPanel";
import { AgentPromptDialog } from "./components/channel/AgentPromptDialog";
import { useHub } from "./lib/store";
import { VERSION } from "../../version";
import type { AgentChannel } from "../../db/schema";

type Page = { view: "overview" } | { view: "channel"; id: string };

function App() {
  const [page, setPage] = useState<Page>({ view: "overview" });
  const channels = useHub((s) => s.channels);
  // Desktop-only rail collapse (persisted). On mobile the sidebar is a drawer,
  // so every collapse-derived style is gated behind the `md:` breakpoint.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("agenthub:sidebar") === "collapsed",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // The member whose join prompt is shown. Owned here so both the rail roster
  // and message @mentions can open the same dialog.
  const [promptFor, setPromptFor] = useState<AgentChannel | null>(null);

  function toggle() {
    setCollapsed((v) => {
      localStorage.setItem("agenthub:sidebar", v ? "expanded" : "collapsed");
      return !v;
    });
  }

  /** Navigate and close the mobile drawer (no-op on desktop). */
  function navTo(p: Page) {
    setPage(p);
    setMobileNavOpen(false);
  }

  const activeChannel = page.view === "channel" ? page.id : null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar (inline on desktop, off-canvas drawer on mobile) ── */}
      <aside
        aria-label="Primary navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-200",
          "md:static md:z-auto md:translate-x-0 md:transition-[width]",
          collapsed ? "md:w-14" : "md:w-56",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-zinc-800 px-3 py-3.5", collapsed && "md:justify-center md:px-0")}>
          <Boxes size={20} className="shrink-0 text-indigo-400" />
          <span className={cn("flex-1 text-sm font-bold", collapsed && "md:hidden")}>AgentHub</span>
          {!collapsed && (
            <button
              onClick={toggle}
              className="hidden rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:inline-flex"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {collapsed && (
          <button
            onClick={toggle}
            className="mx-auto mt-2 hidden rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 md:block"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* Middle: channel nav + (when a channel is open) its member roster.
            Each region scrolls independently so they can share the rail. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Channels">
            <NavItem
              icon={<LayoutGrid size={16} />}
              label="Overview"
              collapsed={collapsed}
              active={page.view === "overview"}
              onClick={() => navTo({ view: "overview" })}
            />

            {channels.length > 0 && (
              <p className={cn("px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600", collapsed && "md:hidden")}>
                Channels
              </p>
            )}
            {channels.length > 0 && collapsed && <div className="my-2 hidden border-t border-zinc-800 md:block" />}

            {channels.map((ch) => (
              <NavItem
                key={ch.id}
                icon={<Hash size={16} />}
                label={ch.id}
                mono
                collapsed={collapsed}
                active={activeChannel === ch.id}
                onClick={() => navTo({ view: "channel", id: ch.id })}
              />
            ))}
          </nav>

          {activeChannel && (
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800 p-2">
              <MembersPanel channelId={activeChannel} collapsed={collapsed} onShowPrompt={setPromptFor} />
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 p-2">
          <ThemeSwitcher collapsed={collapsed} />
          <p className={cn("px-2.5 pt-1.5 text-[10px] text-zinc-600", collapsed && "md:hidden")}>
            v{VERSION}
          </p>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2.5 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <Boxes size={18} className="text-indigo-400" />
          <span className="text-sm font-bold">AgentHub</span>
        </header>

        <main className="flex-1 overflow-hidden p-3 sm:p-6">
          {page.view === "overview" && (
            <OverviewPage onSelectChannel={(id) => navTo({ view: "channel", id })} />
          )}
          {page.view === "channel" && (
            <ChannelPage channelId={page.id} onBack={() => navTo({ view: "overview" })} onShowPrompt={setPromptFor} />
          )}
        </main>
      </div>

      {/* Join-prompt dialog (shared by the rail roster and message mentions) */}
      <AgentPromptDialog
        channelId={promptFor?.channel_id ?? ""}
        member={promptFor}
        onClose={() => setPromptFor(null)}
      />
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
        collapsed && "md:justify-center md:px-0",
        active ? "bg-indigo-600/15 text-indigo-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className={cn("flex-1 truncate text-left", mono && "font-mono text-xs", collapsed && "md:hidden")}>{label}</span>
    </button>
  );
}

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<App />);
