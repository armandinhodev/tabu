"use client";

import type { GameStateView, TurnView } from "@/application/dto/game-state";
import { Button } from "@/ui/components/ui/button";
import { teamNameOf } from "@/ui/components/game/team-colors";

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
  const descriptor = state.teams
    .flatMap((team) => team.players)
    .find((player) => player.playerId === turn.descriptorId);
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-2 p-5">
      <h1 className="font-display text-h2 font-bold text-fg">
        Turno de {teamNameOf(state.teams, turn.teamId)}
      </h1>
      <p className="text-body text-fg">Describe: {descriptor?.name ?? "Jugador"}</p>
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
  );
}
