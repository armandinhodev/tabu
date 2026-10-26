"use client";

import { useGame } from "@/ui/providers/game-provider";
import { ReconnectBanner } from "@/ui/components/game/banners";
import { HomeScreen } from "@/ui/screens/home-screen";
import { CreateScreen } from "@/ui/screens/create-screen";
import { JoinScreen } from "@/ui/screens/join-screen";
import { LobbyScreen } from "@/ui/screens/lobby-screen";
import { GameScreen } from "@/ui/screens/game-screen";
import { ResultScreen } from "@/ui/screens/result-screen";
import { PenaltyOverlay } from "@/ui/screens/game/penalty-overlay";
import { RoundOverlay } from "@/ui/screens/game/round-overlay";

/** Raíz del cliente: una sola pantalla montada, sin perder el socket al navegar. */
export function AppRoot() {
  const { view, connection, state, penalty, roundSummary, dismissPenalty, dismissRoundSummary } =
    useGame();

  return (
    <>
      {connection === "reconnecting" || connection === "offline" ? <ReconnectBanner /> : null}

      {view === "home" ? <HomeScreen /> : null}
      {view === "create" ? <CreateScreen /> : null}
      {view === "join" ? <JoinScreen /> : null}
      {view === "lobby" ? <LobbyScreen /> : null}
      {view === "game" ? <GameScreen /> : null}
      {view === "result" ? <ResultScreen /> : null}

      {penalty !== null && view !== "result" ? (
        <PenaltyOverlay
          penalty={penalty}
          teams={state?.teams.map((team) => ({
            id: team.id,
            name: team.name,
            score: team.score,
            color: team.color,
          })) ?? []}
          onClose={dismissPenalty}
        />
      ) : null}

      {roundSummary !== null && view !== "result" ? (
        <RoundOverlay round={roundSummary} onClose={dismissRoundSummary} />
      ) : null}
    </>
  );
}
