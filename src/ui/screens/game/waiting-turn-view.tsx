"use client";

import type { GameStateView, TurnView } from "@/application/dto/game-state";
import { Button } from "@/ui/components/ui/button";
import { CurrentTurnCard } from "@/ui/components/game/current-turn-card";

export function WaitingTurnView({
  state,
  turn,
  busy,
  onStart,
}: {
  readonly state: GameStateView;
  readonly turn: TurnView;
  readonly busy: boolean;
  readonly onStart: () => void;
}) {
  const team = state.teams.find((candidate) => candidate.id === turn.teamId) ?? null;
  return (
    <div className="flex flex-col gap-4">
      <CurrentTurnCard team={team} descriptorId={turn.descriptorId} pending />
      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5">
        <p className="text-body-sm text-fg-muted">
          El reloj comienza cuando quien describe inicia el turno.
        </p>
        {state.me.role === "DESCRIBER" ? (
          <Button block disabled={busy} onClick={onStart}>
            Comenzar turno
          </Button>
        ) : (
          <p className="text-body-sm text-fg-muted">Esperando a quien describe.</p>
        )}
      </section>
    </div>
  );
}
