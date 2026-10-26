"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { ErrorState } from "@/ui/components/game/banners";
import { Screen, ScreenHeader, StickyFooter } from "@/ui/components/ui/screen";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { SegmentedControl } from "@/ui/components/ui/segmented-control";
import { Switch } from "@/ui/components/ui/switch";
import { MuteButton } from "@/ui/components/game/mute-button";
import { useGame } from "@/ui/providers/game-provider";
import { cn } from "@/ui/lib/cn";

interface DeckOption {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly cardCount: number;
}

type LoadState = "loading" | "ready" | "error";

const TEAM_OPTIONS = [
  { value: "2", label: "2 equipos" },
  { value: "3", label: "3 equipos" },
  { value: "4", label: "4 equipos" },
] as const;

const TIME_OPTIONS = [
  { value: "30", label: "30 s" },
  { value: "45", label: "45 s" },
  { value: "60", label: "60 s" },
] as const;

/** 02 — Crear partida: mazo, equipos y tiempo por turno (§6.1, §12). */
export function CreateScreen() {
  const { createGame, busy, goTo, playerName } = useGame();
  const [deckState, setDeckState] = useState<LoadState>("loading");
  const [decks, setDecks] = useState<readonly DeckOption[]>([]);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState<"2" | "3" | "4">("2");
  const [turnSeconds, setTurnSeconds] = useState<"30" | "45" | "60">("45");
  const [randomTeams, setRandomTeams] = useState(false);

  const loadDecks = (): void => {
    setDeckState("loading");

    fetch("/api/decks", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("decks request failed");
        }

        const payload = (await response.json()) as { decks: DeckOption[] };
        setDecks(payload.decks);
        setDeckId(payload.decks[0]?.id ?? null);
        setDeckState(payload.decks.length === 0 ? "error" : "ready");
      })
      .catch(() => {
        setDeckState("error");
      });
  };

  useEffect(() => {
    loadDecks();
  }, []);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Nueva partida"
        title="Crear partida"
        subtitle={`Vas a jugar como ${playerName === "" ? "Jugador" : playerName}.`}
        action={<MuteButton />}
      />

      {deckState === "loading" ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : deckState === "error" ? (
        <ErrorState
          title="No pudimos cargar los mazos"
          message="Revisá que la base esté levantada y volvé a intentar."
          onRetry={loadDecks}
        />
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-caption uppercase text-fg-muted">Mazo</legend>
          {decks.map((deck) => {
            const selected = deck.id === deckId;

            return (
              <label
                key={deck.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-surface p-4 transition-colors duration-[var(--dur-instant)]",
                  selected ? "border-accent" : "border-line hover:border-line-strong",
                )}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-h3 font-semibold text-fg">{deck.name}</span>
                  <span className="text-body-sm text-fg-muted">
                    {deck.cardCount} cartas · {deck.category}
                  </span>
                </span>
                <input
                  type="radio"
                  name="deck"
                  value={deck.id}
                  checked={selected}
                  onChange={() => setDeckId(deck.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-pill border",
                    selected ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                  )}
                >
                  {selected ? <Check className="size-4" /> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-caption uppercase text-fg-muted">Equipos</span>
        <SegmentedControl
          label="Cantidad de equipos"
          value={teamCount}
          options={TEAM_OPTIONS}
          onValueChange={setTeamCount}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-caption uppercase text-fg-muted">Tiempo por turno</span>
        <SegmentedControl
          label="Tiempo por turno"
          value={turnSeconds}
          options={TIME_OPTIONS}
          onValueChange={setTurnSeconds}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-col">
          <span className="text-body text-fg">Equipos balanceados</span>
          <span className="text-body-sm text-fg-muted">
            Repartimos automáticamente al arrancar.
          </span>
        </div>
        <Switch
          label="Equipos balanceados"
          checked={randomTeams}
          onCheckedChange={setRandomTeams}
        />
      </div>

      <StickyFooter>
        <Button
          block
          disabled={busy || deckId === null || deckState !== "ready"}
          onClick={() => {
            if (deckId === null) {
              return;
            }

            void createGame({
              deckId,
              teamCount: Number(teamCount),
              turnSeconds: Number(turnSeconds),
              randomTeams,
            });
          }}
        >
          Crear sala
        </Button>
        <Button variant="ghost" block onClick={() => goTo("home")}>
          Volver
        </Button>
      </StickyFooter>
    </Screen>
  );
}
