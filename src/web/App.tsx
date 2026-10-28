import { useEffect, useState, useSyncExternalStore } from "react";
import type { Thread } from "../lib/hub-store";
import { hubStore, useHub } from "./lib/store";
import { Sidebar } from "./components/Sidebar";
import { Notices } from "./components/Notices";
import { NewRoomDialog } from "./components/NewRoomDialog";
import { SpawnDialog } from "./components/SpawnDialog";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { SessionPage } from "./pages/SessionPage";

/** `#/room/<id>` | `#/session/<sessionId>` | anything else → home. */
function parseHash(hash: string): Thread | null {
  const [, kind, id] = hash.replace(/^#/, "").split("/");
  if (!id) return null;
  if (kind === "room") return { kind: "room", id: decodeURIComponent(id) };
  if (kind === "session") return { kind: "session", sessionId: decodeURIComponent(id) };
  return null;
}

function subscribeHash(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** App shell: sidebar + the selected thread. The URL hash is the router. */
export function App() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  const selected = useHub((s) => s.selected);
  const [newRoom, setNewRoom] = useState(false);
  const [spawn, setSpawn] = useState(false);

  // One live connection for the app's lifetime.
  useEffect(() => hubStore.getState().connect(), []);

  // Route → store selection (loads the thread).
  useEffect(() => {
    hubStore.getState().select(parseHash(hash));
  }, [hash]);

  return (
    <div className="flex h-full">
      <Sidebar onNewRoom={() => setNewRoom(true)} onSpawn={() => setSpawn(true)} />
      <main className="flex min-w-0 flex-1">
        {selected?.kind === "room" && <RoomPage key={selected.id} id={selected.id} />}
        {selected?.kind === "session" && <SessionPage key={selected.sessionId} sessionId={selected.sessionId} />}
        {!selected && <HomePage onNewRoom={() => setNewRoom(true)} onSpawn={() => setSpawn(true)} />}
      </main>
      <NewRoomDialog open={newRoom} onClose={() => setNewRoom(false)} />
      <SpawnDialog open={spawn} onClose={() => setSpawn(false)} />
      <Notices />
    </div>
  );
}
