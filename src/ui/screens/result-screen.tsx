"use client";

import { Crown, Trophy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { ConfirmDialog } from "@/ui/components/ui/dialog";
import { Screen } from "@/ui/components/ui/screen";
import { Confetti } from "@/ui/components/game/confetti";
import { MuteButton } from "@/ui/components/game/mute-button";
import { useGame } from "@/ui/providers/game-provider";
import { cn } from "@/ui/lib/cn";

/** 10 — Resultado final: trofeo, ranking y MVP (§8, §12). */
export function ResultScreen() {
  const { state, finish, leaveGame, busy } = useGame();
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (state === null) {
    return null;
  }

  const standings =
    finish?.standings ??
    [...state.teams]
      .map((team) => ({ teamId: team.id, name: team.name, score: team.score }))
      .sort((left, right) => right.score - left.score);

  const winner = finish?.winnerTeamId ?? null;
  const mvp = finish?.mvp ?? null;
  const ranking = finish?.ranking ?? [];
  const isDraw = winner === null;

  return (
    <Screen>
      {isDraw ? null : <Confetti />}
      <div className="flex justify-end">
        <MuteButton />
      </div>

      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-20 place-items-center rounded-pill",
            isDraw ? "bg-surface-2 text-fg-muted" : "bg-gold/18 text-gold",
          )}
        >
          {isDraw ? <Crown className="size-9" /> : <Trophy className="size-9" />}
        </span>
        <h1 className="font-display text-display font-extrabold text-fg">
          {isDraw ? "Empate" : `Ganó ${standings[0]?.name ?? "el equipo"}`}
        </h1>
        <p className="text-body-sm text-fg-muted" aria-live="polite">
          {isDraw
            ? "Nadie sacó ventaja: se declara empate."
            : "Partida terminada. Así quedó la tabla."}
        </p>
      </header>

      <h2 className="text-caption text-fg-subtle uppercase">Equipos</h2>
      <ol className="-mt-2 flex flex-col gap-2" aria-label="Tabla final">
        {standings.map((standing, index) => {
          const mine = standing.teamId === state.me.teamId;

          return (
            <li
              key={standing.teamId}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-4 py-4",
                mine ? "border-line-strong bg-surface-2" : "border-line bg-surface",
              )}
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-body text-fg-subtle tabular-nums">{index + 1}</span>
                <span className="text-body text-fg">{standing.name}</span>
                {mine ? (
                  <span className="rounded-sm bg-surface-3 px-2 py-0.5 text-micro text-fg-muted uppercase">
                    vos
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-h2 font-bold text-gold tabular-nums">
                {standing.score}
              </span>
            </li>
          );
        })}
      </ol>

      {mvp !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
          <span className="flex items-center gap-2 text-caption text-fg-subtle uppercase">
            <Crown aria-hidden="true" className="size-4 text-gold" />
            MVP
          </span>
          <span className="text-body text-fg">
            {mvp.name} · <span className="font-mono text-gold tabular-nums">{mvp.points}</span>
          </span>
        </div>
      ) : null}

      {ranking.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="ranking-heading">
          <h2 id="ranking-heading" className="text-caption text-fg-subtle uppercase">
            Palabras adivinadas
          </h2>
          <ol className="flex flex-col gap-2" aria-label="Palabras adivinadas">
            {ranking.map((row, index) => {
              const mine = row.playerId === state.me.playerId;

              return (
                <li
                  key={row.playerId}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                    mine ? "border-line-strong bg-surface-2" : "border-line bg-surface",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="font-mono text-body-sm text-fg-subtle tabular-nums">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body text-fg">{row.name}</span>
                      <span className="truncate text-body-sm text-fg-muted">{row.teamName}</span>
                    </span>
                  </span>
                  <span className="font-mono text-h3 font-bold text-gold tabular-nums">
                    {row.guessed}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Button block disabled={busy} onClick={() => setConfirmLeave(true)}>
          Volver al inicio
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="¿Terminar de jugar?"
        description="Vas a salir de esta partida y volver al inicio."
        confirmLabel="Volver al inicio"
        cancelLabel="Quedarme"
        tone="primary"
        onConfirm={leaveGame}
      />
    </Screen>
  );
}
