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
    <div className="flex gap-2 justify-end" aria-label="Spilmenu">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost">🔄 Start forfra</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start et nyt spil?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle går tilbage til venteværelset på niveau 1 med nye kort. De samme spillere beholder deres pladser,
              og dem, der er faldet fra, kan komme ind igen, før I trykker Start.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Spil videre</AlertDialogCancel>
            <AlertDialogAction onClick={restartGame}>Start forfra</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost">🚪 Forlad spil</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forlad spillet for altid?</AlertDialogTitle>
            <AlertDialogDescription>
              Din plads fjernes, og dine kort ryger i kassebunken. Er det din tur, går den videre til næste spiller.
              Lukker du bare browseren, beholder du din plads og kan komme tilbage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bliv</AlertDialogCancel>
            <AlertDialogAction onClick={leaveGame}>Forlad spil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
