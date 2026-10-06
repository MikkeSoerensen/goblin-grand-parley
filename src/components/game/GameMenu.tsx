import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGame } from "@/lib/store";

/** Start over or leave — both behind a confirmation, so nobody ends a game by accident. */
export function GameMenu() {
  const restartGame = useGame(s => s.restartGame);
  const leaveGame = useGame(s => s.leaveGame);

  return (
    <div className="flex gap-2 justify-end" aria-label="Game menu">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost">🔄 Start over</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new game?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone goes back to the waiting room at level 1 with fresh cards. The same players keep their seats,
              and anyone who dropped out can join again before you press Start.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={restartGame}>Start over</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost">🚪 Leave game</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this game for good?</AlertDialogTitle>
            <AlertDialogDescription>
              Your seat is removed and your cards go to the discard pile. If it's your turn, it passes to the next player.
              Just closing the browser instead keeps your seat, so you can come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={leaveGame}>Leave game</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
