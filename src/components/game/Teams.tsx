import { Button } from "@/components/ui/button";
import { send } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TEAM_LABEL } from "../../../shared/rules";
import { TEAM_IDS, type ClientView, type TeamId } from "../../../shared/types";
import { TEAM_STYLE } from "./teamStyle";


/** A small coloured label: "Hold Rød". */
export function TeamTag({ team, className }: { team: TeamId | null; className?: string }) {
  if (!team) return null;
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui font-bold leading-none", TEAM_STYLE[team].chip, className)}>
      {TEAM_LABEL[team]}
    </span>
  );
}

/** Waiting room, team mode: pick your colour (two per team) or let the dice decide. */
export function TeamPicker({ view }: { view: ClientView }) {
  const self = view.self;
  // Enough teams for everyone (two per team), at least two.
  const shown = TEAM_IDS.slice(0, Math.max(2, Math.ceil(view.players.length / 2)));
  return (
    <div className="space-y-2 text-left">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-ui opacity-70">Vælg hold — præcis 2 på hvert hold</div>
        <Button size="sm" variant="secondary" onClick={() => send({ type: "shuffleTeams" })}>🎲 Bland hold</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {shown.map(team => {
          const members = view.players.filter(p => p.team === team);
          const mine = self?.team === team;
          const full = members.length >= 2 && !mine;
          return (
            <button
              key={team}
              type="button"
              disabled={full}
              aria-pressed={mine}
              onClick={() => send({ type: "chooseTeam", team: mine ? null : team })}
              className={cn(
                "rounded-lg border-2 p-2 text-left transition-colors disabled:opacity-50",
                mine ? cn("ring-2", TEAM_STYLE[team].ring, "border-transparent bg-muted/60") : "border-border bg-muted/30 hover:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-1.5 font-display text-sm">
                <span className={cn("w-3 h-3 rounded-full", TEAM_STYLE[team].dot)} /> Hold {TEAM_LABEL[team]}
                <span className="ml-auto text-xs font-ui opacity-60">{members.length}/2</span>
              </div>
              <div className="text-xs font-ui opacity-80 mt-1 min-h-[1rem]">
                {members.map(p => p.name).join(" & ") || <span className="italic opacity-60">ledigt</span>}
              </div>
            </button>
          );
        })}
      </div>
      {view.players.length % 2 === 1 || view.players.length < 4 ? (
        <p className="text-xs font-ui text-amber-300">Holdspil kræver et lige antal spillere — mindst 4.</p>
      ) : view.players.some(p => !p.team) ? (
        <p className="text-xs font-ui opacity-70">Venter på, at alle vælger hold: {view.players.filter(p => !p.team).map(p => p.name).join(", ")}.</p>
      ) : null}
    </div>
  );
}
