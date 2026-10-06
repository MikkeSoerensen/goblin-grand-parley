import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/lib/store";
import { loadSession } from "@/lib/session";
import { Dice5 } from "lucide-react";

export function Lobby() {
  const join = useGame(s => s.join);
  const watch = useGame(s => s.watch);
  const seatOffer = useGame(s => s.seatOffer);
  const [name, setName] = useState(() => loadSession()?.name ?? "");
  const [room, setRoom] = useState(() => loadSession()?.roomCode ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !room.trim()) return;
    join(name.trim(), room.trim().toUpperCase());
  };

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <form onSubmit={submit} className="felt-table p-6 sm:p-8 max-w-md w-full">
        <h1 className="font-display text-4xl sm:text-5xl brass-text text-center mb-1 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <Dice5 className="w-9 h-9 sm:w-10 sm:h-10 text-primary shrink-0"/> Goblin Grand Parley
        </h1>
        <p className="text-center text-muted-foreground mb-6 italic">Spark døren ind. Indgå en aftale. Bryd den.</p>

        <div className="space-y-3">
          <div>
            <label htmlFor="player-name" className="font-ui text-sm opacity-80">Dit navn</label>
            <Input id="player-name" value={name} onChange={e => setName(e.target.value)} placeholder="fx Ridder Stikkelsen" maxLength={20} autoComplete="nickname"/>
          </div>
          <div>
            <label htmlFor="room-code" className="font-ui text-sm opacity-80">Rumkode</label>
            <div className="flex gap-2">
              <Input
                id="room-code"
                value={room}
                onChange={e => setRoom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="FANGEHUL"
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
              />
              <Button variant="secondary" type="button" aria-label="Tilfældig rumkode" onClick={() => setRoom(Math.random().toString(36).slice(2, 7).toUpperCase())}>🎲</Button>
            </div>
            <p className="text-xs opacity-60 mt-1">Alle på samme Wi-Fi skriver den samme kode.</p>
          </div>
          {seatOffer && (
            <div className="rounded-lg border-2 border-primary/60 bg-primary/10 p-3 space-y-2" role="status">
              <p className="text-sm font-ui">Rum <b>{seatOffer.roomCode}</b> er allerede i gang. Overtag en ledig plads:</p>
              <div className="flex flex-wrap gap-2">
                {seatOffer.names.map(n => (
                  <Button key={n} type="button" size="sm" onClick={() => { setName(n); join(n, seatOffer.roomCode); }}>
                    Spil som {n}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button type="submit" className="w-full mt-2" size="lg" disabled={!name.trim() || !room.trim()}>
            Gå ind i fangehullet
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={!room.trim()}
            onClick={() => watch(room.trim().toUpperCase())}>
            📺 Brug denne skærm som fælles bordskærm
          </Button>
          <p className="text-xs opacity-60 text-center">Til et TV eller en bærbar, alle kan se — den viser bordet, ikke nogens hånd.</p>
        </div>
      </form>
    </main>
  );
}
