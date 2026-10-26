"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { ConfirmDialog } from "@/ui/components/ui/dialog";
import { ErrorState, ScreenSkeleton } from "@/ui/components/game/banners";
import { MuteButton } from "@/ui/components/game/mute-button";
import { TeamPanel } from "@/ui/components/game/team-panel";
import { useGame } from "@/ui/providers/game-provider";
import { ResultScreen } from "@/ui/screens/result-screen";
import { DescribingView } from "./game/describing-view";
import { RivalView } from "./game/rival-view";
import type { RoleViewProps } from "./game/role-view-props";

/**
 * 05/06/07 — Partida en vivo. La misma información para todos (S3); cambia la
 * vista según `me.role`. En ≥1280 se suman los dos rails (§10).
 */
export function GameScreen() {
  const { state, busy, guess, passTurn, skipTurn, reportViolation, penalty, leaveGame } = useGame();
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (state === null) {
    return <ScreenSkeleton />;
  }

  if (state.status === "finished") {
    return <ResultScreen />;
  }

  const turn = state.turn;

  if (turn === undefined) {
    return (
      <main className="mx-auto w-full max-w-[430px] px-5 py-10">
        <ErrorState
          title="Esperando el turno"
          message="La partida sigue, pero todavía no hay una carta activa."
        />
      </main>
    );
  }

  const role = state.me.role;
  const props: RoleViewProps = {
    state,
    turn,
    busy,
    reportedWord: penalty?.tabooWord ?? null,
    onGuess: guess,
    onPass: passTurn,
    onSkipCard: skipTurn,
    onReport: reportViolation,
  };

  const isRival = role === "RIVAL";
  const activeTeam = state.teams.find((team) => team.id === turn.teamId) ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 md:px-8 xl:grid xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:items-start xl:gap-8 xl:pt-8">
      <div className="mb-2 flex items-center justify-between xl:hidden">
        <span className="text-caption uppercase text-fg-subtle">
          {state.code} · ronda {state.round}
        </span>
        <Button
          variant="quiet"
          size="icon"
          aria-label="Salir de la partida"
          onClick={() => setConfirmLeave(true)}
        >
          <LogOut aria-hidden="true" className="size-5" />
        </Button>
      </div>

      <aside className="hidden xl:flex xl:flex-col xl:gap-3">
        <h2 className="text-caption uppercase text-fg-subtle">Equipos</h2>
        {state.teams.map((team) => (
          <TeamPanel
            key={team.id}
            team={team}
            canJoin={false}
            isMine={team.id === state.me.teamId}
            isActive={team.id === turn.teamId}
            showScore
          />
        ))}
      </aside>

      <div className="flex flex-col gap-4">
        {isRival ? <RivalView {...props} /> : <DescribingView {...props} />}
      </div>

      <aside className="hidden xl:flex xl:flex-col xl:gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-caption uppercase text-fg-subtle">Turno</h2>
          <MuteButton />
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-body-sm text-fg-muted">Describe</p>
          <p className="mt-1 text-h3 font-semibold text-fg">
            {activeTeam?.players.find((player) => player.playerId === turn.descriptorId)?.name ??
              "—"}
          </p>
          <p className="mt-3 text-body-sm text-fg-muted">
            Tu rol:{" "}
            <span className="text-fg">
              {role === "DESCRIBER"
                ? "describís"
                : role === "ACTIVE"
                  ? "adivinás"
                  : role === "RIVAL"
                    ? "vigilás"
                    : "mirás"}
            </span>
          </p>
        </div>
        <Button variant="quiet" block onClick={() => setConfirmLeave(true)}>
          <LogOut aria-hidden="true" className="size-4" />
          Salir de la partida
        </Button>
      </aside>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="¿Salir de la partida?"
        description="Quedás fuera de la sala. Si volvés a entrar necesitás el código."
        confirmLabel="Salir"
        onConfirm={leaveGame}
      />
    </main>
  );
}
