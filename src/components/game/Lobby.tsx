import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { send } from "@/lib/store";
import { Dice5 } from "lucide-react";

export function Lobby({ onJoined }: { onJoined: () => void }) {
  const [name, setName] = useState(() => localStorage.getItem("munchkin:name") ?? "");
  const [room, setRoom] = useState(() => localStorage.getItem("munchkin:room") ?? "");

  const join = () => {
    if (!name.trim() || !room.trim()) return;
    localStorage.setItem("munchkin:name", name);
    localStorage.setItem("munchkin:room", room.toUpperCase());
    send({ type: "join", name: name.trim(), roomCode: room.trim().toUpperCase() });
    onJoined();
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="felt-table p-8 max-w-md w-full">
        <h1 className="font-display text-5xl brass-text text-center mb-1 flex items-center justify-center gap-3">
          <Dice5 className="w-10 h-10 text-primary"/> Munchkin
        </h1>
        <p className="text-center text-muted-foreground mb-6 italic">Kick the door. Kill the monster. Steal the treasure. Stab your friends.</p>

        <div className="space-y-3">
          <div>
            <label className="font-ui text-sm opacity-80">Your name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sir Stabsalot" maxLength={20}/>
          </div>
          <div>
            <label className="font-ui text-sm opacity-80">Room code</label>
            <div className="flex gap-2">
              <Input value={room} onChange={e => setRoom(e.target.value.toUpperCase())} placeholder="DUNGEON" maxLength={8}/>
              <Button variant="secondary" type="button" onClick={() => setRoom(Math.random().toString(36).slice(2, 7).toUpperCase())}>🎲</Button>
            </div>
            <p className="text-xs opacity-60 mt-1">Share this code with friends on the same Wi-Fi.</p>
          </div>
          <Button className="w-full mt-2" size="lg" onClick={join} disabled={!name.trim() || !room.trim()}>
            Enter the Dungeon
          </Button>
        </div>
      </div>
    </main>
  );
}
