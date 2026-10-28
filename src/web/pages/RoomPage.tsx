import { useCallback, useState } from "react";
import { Hash, Pause, Play, Settings } from "lucide-react";
import { hubStore, useHub } from "../lib/store";
import { Composer } from "../components/Composer";
import { Feed } from "../components/Feed";
import { MembersPanel } from "../components/MembersPanel";
import { RoomSettingsDialog } from "../components/RoomSettingsDialog";
import { SpawnDialog } from "../components/SpawnDialog";
import { Button, IconButton } from "../components/ui";

/** A room: feed + composer in the centre, roster on the right. */
export function RoomPage({ id }: { id: string }) {
  const room = useHub((s) => s.rooms.find((r) => r.id === id));
  const connected = useHub((s) => s.connected);
  const messages = useHub((s) => s.threads[`room:${id}`]);
  const [settings, setSettings] = useState(false);
  const [spawn, setSpawn] = useState(false);

  const names = useCallback(
    (sessionId: string) => room?.members.find((m) => m.sessionId === sessionId)?.alias ?? sessionId.slice(0, 8),
    [room],
  );

  if (!room) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">{connected ? `Room #${id} not found` : "Connecting…"}</div>;
  }

  const togglePause = async () => {
    const res = await hubStore.getState().updateRoom(id, { paused: !room.paused });
    if (!res.ok) hubStore.getState().notify("warn", res.error);
  };

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
          <Hash className="size-5 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-zinc-100">{room.id}</h1>
            {room.topic && <p className="truncate text-xs text-zinc-500">{room.topic}</p>}
          </div>
          <Button variant={room.paused ? "primary" : "ghost"} onClick={() => void togglePause()} title={room.paused ? "Resume relaying" : "Stop relaying (messages are still logged)"}>
            {room.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {room.paused ? "Resume" : "Pause"}
          </Button>
          <IconButton onClick={() => setSettings(true)} title="Room settings">
            <Settings className="size-4" />
          </IconButton>
        </header>
        {room.paused && (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-300">
            Paused: agent messages are logged here but not relayed to other members.
          </div>
        )}
        <Feed messages={messages} names={names} empty="No messages yet. Add members, then say hello — everyone in the room receives it." />
        <Composer thread={{ kind: "room", id }} placeholder={`Message #${id} (@alias to target, Shift+Enter for newline)`} aliases={room.members.map((m) => m.alias)} />
      </section>
      <MembersPanel room={room} onSpawn={() => setSpawn(true)} />
      <RoomSettingsDialog room={room} open={settings} onClose={() => setSettings(false)} />
      <SpawnDialog open={spawn} onClose={() => setSpawn(false)} roomId={id} />
    </div>
  );
}
