"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { ConfirmDialog } from "@/ui/components/ui/dialog";
import { ErrorState, ScreenSkeleton } from "@/ui/components/game/banners";
import { MuteButton } from "@/ui/components/game/mute-button";
import { TeamPanel } from "@/ui/components/game/team-panel";
import { CurrentTurnCard } from "@/ui/components/game/current-turn-card";
import { TimerRing } from "@/ui/components/game/timer-ring";
import { useGame } from "@/ui/providers/game-provider";
import { ResultScreen } from "@/ui/screens/result-screen";
import { DescribingView } from "./game/describing-view";
import { GuessChat } from "./game/guess-chat";
import { RivalView } from "./game/rival-view";
import { WaitingTurnView } from "./game/waiting-turn-view";
import type { RoleViewProps } from "./game/role-view-props";

/**
 * 05/06/07 — Partida en vivo. Cada rol ve lo que le corresponde (S3, S4): el
 * descriptor y los rivales la palabra, el equipo que adivina solo su chat
 * privado de respuestas. En ≥1280 se suman los dos rails (§10).
 */
export function GameScreen() {
  const {
    state,
    busy,
    guess,
    guessMessages,
    startTurn,
    skipTurn,
    reportViolation,
    penalty,
    leaveGame,
  } = useGame();
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
    onSkipCard: skipTurn,
    onReport: reportViolation,
  };

  const isRival = role === "RIVAL";
  const isGuesser = role === "ACTIVE";
  const activeTeam = state.teams.find((team) => team.id === turn.teamId) ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col gap-4 px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 md:px-8 xl:grid xl:grid-cols-[240px_minmax(0,1fr)_256px] xl:items-start xl:gap-6 xl:pt-8">
      <div className="mb-2 flex items-center justify-between xl:hidden">
        <span className="text-caption text-fg-muted uppercase">
          {state.code} · ronda {state.round}
        </span>
        <div role="group" aria-label="Controles de la partida" className="flex items-center gap-2">
          <MuteButton />
          <Button
            variant="quiet"
            size="icon"
            aria-label="Salir de la partida"
            onClick={() => setConfirmLeave(true)}
          >
            <LogOut aria-hidden="true" className="size-5" />
          </Button>
        </div>
      </div>

      <aside className="hidden xl:flex xl:flex-col xl:gap-3">
        <h2 className="text-caption text-fg-subtle uppercase">Equipos</h2>
        {state.teams.map((team) => (
          <TeamPanel
            key={team.id}
            team={team}
            canJoin={false}
            isMine={team.id === state.me.teamId}
            isActive={team.id === turn.teamId}
            descriptorId={turn.descriptorId}
            showScore
          />
        ))}
      </aside>

      <div
        data-testid="game-columns"
        className="order-2 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start xl:order-none"
      >
        <div className="flex min-w-0 flex-col gap-4">
          {turn.status === "pending" ? (
            <WaitingTurnView state={state} turn={turn} busy={busy} onStart={startTurn} />
          ) : isRival ? (
            <RivalView {...props} />
          ) : (
            <DescribingView {...props} />
          )}
        </div>

        <GuessChat
          active={isGuesser && turn.status !== "pending"}
          disabled={busy}
          messages={guessMessages}
          onGuess={guess}
        />
      </div>

      <aside
        aria-label="Información del turno"
        className={
          turn.status === "pending"
            ? "hidden xl:flex xl:flex-col xl:gap-3"
            : "order-1 grid grid-cols-[minmax(0,1fr)_6rem] items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_7rem] xl:order-none xl:flex xl:flex-col"
        }
      >
        {turn.status !== "pending" ? (
          <>
            <CurrentTurnCard
              team={activeTeam}
              descriptorId={turn.descriptorId}
              pending={false}
              compact
            />
            <section
              aria-label="Tiempo del turno"
              className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-line bg-surface py-2 xl:p-4"
            >
              <h2 className="sr-only text-caption text-fg-muted uppercase xl:not-sr-only">
                Tiempo restante
              </h2>
              <TimerRing
                deadlineAt={turn.deadlineAt}
                turnSeconds={turn.turnSeconds}
                className="size-24 md:size-28 xl:size-40 [&>div>span.font-mono]:text-h1 [&>div>span:last-child]:hidden xl:[&>div>span:last-child]:block [&>div>svg]:size-4"
              />
            </section>
          </>
        ) : null}
        <div className="hidden items-center justify-between gap-2 xl:flex">
          <h2 className="text-caption text-fg-subtle uppercase">Tu rol</h2>
          <MuteButton />
        </div>
        <div className="hidden rounded-lg border border-line bg-surface p-4 xl:block">
          <p className="text-h3 font-semibold text-fg">
            {role === "DESCRIBER"
              ? "Describís"
              : role === "ACTIVE"
                ? "Adivinás"
                : role === "RIVAL"
                  ? "Vigilás"
                  : "Mirás"}
          </p>
        </div>
        <Button
          variant="quiet"
          block
          className="hidden xl:inline-flex"
          onClick={() => setConfirmLeave(true)}
        >
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
