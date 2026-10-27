"use client";

import { LogOut, Shuffle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { ConfirmDialog } from "@/ui/components/ui/dialog";
import { Screen, ScreenHeader, StickyFooter } from "@/ui/components/ui/screen";
import { ScreenSkeleton } from "@/ui/components/game/banners";
import { CodeBadge } from "@/ui/components/game/code-badge";
import { MuteButton } from "@/ui/components/game/mute-button";
import { PlayerRow, TeamPanel } from "@/ui/components/game/team-panel";
import { useGame } from "@/ui/providers/game-provider";

/** 04 — Sala de espera (y 11 en desktop): código, equipos y arranque (§6.3). */
export function LobbyScreen() {
  const {
    state,
    busy,
    assignTeam,
    autoTeams,
    startGame,
    leaveGame,
    goTo,
    connection,
  } = useGame();
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (state === null) {
    return <ScreenSkeleton />;
  }

  const assigned = state.teams.reduce((total, team) => total + team.players.length, 0);
  const totalPlayers = assigned + state.waitingPlayers.length;
  const minimum = state.settings.teamCount * state.settings.minPlayersPerTeam;
  // El server exige cero jugadores sin equipo, salvo que randomTeams los reparta al arrancar.
  const everyoneAssigned = state.waitingPlayers.length === 0 || state.settings.randomTeams;
  const canStart =
    state.me.isHost &&
    everyoneAssigned &&
    state.teams.every((team) => team.players.length >= state.settings.minPlayersPerTeam);

  return (
    <Screen narrow={false} className="xl:max-w-[1180px]">
      <ScreenHeader
        eyebrow="Antes de empezar"
        title="Sala de espera"
        subtitle={`${state.settings.teamCount} equipos · ${state.settings.turnSeconds} s por turno · ${state.settings.tabooWordCount} prohibidas por carta · ${state.settings.skipLimit} saltos por turno · ${totalPlayers} de ${minimum} jugadores`}
        action={<MuteButton />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <CodeBadge code={state.code} />

          <section className="flex flex-col gap-3">
            <h2 className="text-caption uppercase text-fg-muted">Equipos</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {state.teams.map((team) => (
                <TeamPanel
                  key={team.id}
                  team={team}
                  canJoin={!busy}
                  isMine={team.id === state.me.teamId}
                  onJoin={() => assignTeam(team.id)}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-caption uppercase text-fg-muted">Sin equipo</h2>
            {state.waitingPlayers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-5 text-body-sm text-fg-subtle">
                Todos eligieron equipo.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4">
                {state.waitingPlayers.map((player) => (
                  <PlayerRow key={player.playerId} player={player} color="team-1" neutral />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-8 xl:self-start">
          <Button variant="tinted" block disabled={busy} onClick={autoTeams}>
            <Shuffle aria-hidden="true" className="size-4 text-team-1" />
            Repartir equipos
          </Button>
          <Button variant="tinted" block onClick={() => setConfirmLeave(true)}>
            <LogOut aria-hidden="true" className="size-4 text-warning" />
            Salir de la sala
          </Button>
        </aside>
      </div>

      <StickyFooter>
        <Button block disabled={busy || !canStart} onClick={startGame}>
          Comenzar partida
        </Button>
        <p className="text-center text-body-sm text-fg-subtle">
          {state.me.isHost
            ? canStart
              ? "Todo listo para arrancar"
              : state.waitingPlayers.length > 0 && !state.settings.randomTeams
                ? "Todos tienen que elegir equipo antes de arrancar"
                : "Cada equipo necesita al menos " +
                  state.settings.minPlayersPerTeam +
                  " jugadores"
            : "Solo el host puede comenzar la partida"}
        </p>
      </StickyFooter>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="¿Salir de la sala?"
        description={
          connection === "online"
            ? "Vas a perder tu lugar en la partida."
            : "Estás sin conexión: vas a volver al inicio y el estado se recupera con tu token."
        }
        confirmLabel="Salir"
        onConfirm={() => {
          if (connection === "online") {
            leaveGame();
            return;
          }

          goTo("home");
        }}
      />
    </Screen>
  );
}
