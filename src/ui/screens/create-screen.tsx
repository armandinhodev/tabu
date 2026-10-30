"use client";

import { ArrowRight, Check, Layers, SlidersHorizontal, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { ErrorState } from "@/ui/components/game/banners";
import { Screen, ScreenHeader } from "@/ui/components/ui/screen";
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
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
] as const;

const TIME_OPTIONS = [
  { value: "30", label: "30 s" },
  { value: "60", label: "60 s" },
  { value: "90", label: "90 s" },
  { value: "120", label: "120 s" },
] as const;

const TABOO_COUNT_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
] as const;

/** Skips por turno (S4): el skip no penaliza, solo acota cuántas cartas se pueden saltar. */
const SKIP_LIMIT_OPTIONS = [
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
] as const;

/** 02 — Crear partida: mazo, equipos y tiempo por turno (§6.1, §12). */
export function CreateScreen() {
  const { createGame, busy, goTo, playerName } = useGame();
  const [deckState, setDeckState] = useState<LoadState>("loading");
  const [decks, setDecks] = useState<readonly DeckOption[]>([]);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState<"2" | "3" | "4">("2");
  const [turnSeconds, setTurnSeconds] = useState<"30" | "60" | "90" | "120">("60");
  const [tabooWordCount, setTabooWordCount] = useState<"1" | "2" | "3" | "4" | "5" | "6">("4");
  const [skipLimit, setSkipLimit] = useState<"0" | "1" | "2" | "3" | "4" | "5">("3");
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

  const selectedDeck = decks.find((deck) => deck.id === deckId);

  return (
    <Screen className="md:max-w-4xl">
      <ScreenHeader
        eyebrow="Prepará la próxima ronda"
        title="Crear partida"
        subtitle={`Vas a jugar como ${playerName === "" ? "Jugador" : playerName}.`}
        action={<MuteButton />}
      />

      <section aria-labelledby="create-deck-heading" className="space-y-4">
        <div className="flex items-start gap-3">
          <Layers aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <h2 id="create-deck-heading" className="font-display text-h3 font-semibold text-fg">
              Elegí un mazo
            </h2>
            <p className="mt-1 text-body-sm text-fg-muted">
              Las cartas que van a jugar todos los equipos.
            </p>
          </div>
        </div>
        {deckState === "loading" ? (
          <div
            role="status"
            aria-label="Cargando mazos"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <span className="sr-only">Cargando mazos…</span>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : deckState === "error" ? (
          <ErrorState
            title="No pudimos cargar los mazos"
            message="No pudimos consultar los mazos. Volvé a intentar en unos segundos."
            onRetry={loadDecks}
          />
        ) : (
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Mazo</legend>
            {decks.map((deck) => {
              const selected = deck.id === deckId;

              return (
                <label
                  key={deck.id}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors duration-[var(--dur-instant)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas motion-reduce:transition-none sm:p-4",
                    selected
                      ? "border-accent bg-accent-soft"
                      : "border-line-strong bg-surface hover:border-line-control hover:bg-surface-2",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-display text-h3 font-semibold break-words text-fg">
                      {deck.name}
                    </span>
                    <span className="text-body-sm text-fg-muted">
                      {deck.cardCount} cartas
                      {deck.category !== deck.name ? ` · ${deck.category}` : ""}
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
      </section>

      <section
        aria-labelledby="create-rules-heading"
        className="rounded-lg border border-line bg-surface p-4 sm:p-6"
      >
        <div className="mb-6 flex items-start gap-3">
          <SlidersHorizontal aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <h2 id="create-rules-heading" className="font-display text-h3 font-semibold text-fg">
              Configurá la partida
            </h2>
            <p className="mt-1 text-body-sm text-fg-muted">
              Podés dejar estos valores y empezar a jugar.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg">Equipos</span>
            <SegmentedControl
              label="Cantidad de equipos"
              value={teamCount}
              options={TEAM_OPTIONS}
              onValueChange={setTeamCount}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg">Tiempo por turno</span>
            <SegmentedControl
              label="Tiempo por turno"
              value={turnSeconds}
              options={TIME_OPTIONS}
              onValueChange={setTurnSeconds}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg">
              Palabras prohibidas por carta
            </span>
            <SegmentedControl
              label="Cantidad de palabras prohibidas"
              value={tabooWordCount}
              options={TABOO_COUNT_OPTIONS}
              onValueChange={setTabooWordCount}
              className="grid grid-cols-3 min-[375px]:grid-cols-6 [&>button]:px-2"
            />
            <p className="text-body-sm text-fg-muted">Más palabras prohibidas, mayor dificultad.</p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg">Saltos de carta por turno</span>
            <SegmentedControl
              label="Cantidad de saltos de carta por turno"
              value={skipLimit}
              options={SKIP_LIMIT_OPTIONS}
              onValueChange={setSkipLimit}
              className="grid grid-cols-3 min-[375px]:grid-cols-6 [&>button]:px-2"
            />
            <p className="text-body-sm text-fg-muted">
              Saltar no resta puntos. Elegí 0 para jugar sin saltos.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
          <div className="flex items-start gap-3">
            <Users
              aria-hidden="true"
              className="mt-1 hidden size-5 shrink-0 text-fg-muted sm:block"
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="create-balanced-teams"
                className="cursor-pointer text-body-sm font-semibold text-fg"
              >
                Equipos balanceados
              </label>
              <span className="text-body-sm text-fg-muted">
                Repartimos automáticamente al arrancar.
              </span>
            </div>
          </div>
          <Switch
            id="create-balanced-teams"
            label="Equipos balanceados"
            checked={randomTeams}
            onCheckedChange={setRandomTeams}
            className="before:absolute before:inset-x-0 before:-inset-y-2"
          />
        </div>
      </section>

      <footer className="mt-auto flex flex-col gap-2 border-t border-line pt-5">
        {deckState === "ready" && selectedDeck && (
          <div
            role="status"
            aria-label="Resumen de la partida"
            className="mb-2 min-w-0 text-body-sm"
          >
            <p className="font-semibold break-words text-fg">{selectedDeck.name}</p>
            <p className="mt-1 text-fg-muted">
              {teamCount} equipos · {turnSeconds} s por turno · {tabooWordCount} prohibidas ·{" "}
              {skipLimit === "0" ? "Sin saltos" : `${skipLimit} saltos`}
            </p>
          </div>
        )}
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
              tabooWordCount: Number(tabooWordCount),
              skipLimit: Number(skipLimit),
              randomTeams,
            });
          }}
        >
          {busy ? "Creando sala…" : "Crear sala"}
          {!busy && <ArrowRight aria-hidden="true" className="size-5" />}
        </Button>
        <Button variant="quiet" block onClick={() => goTo("home")}>
          Volver
        </Button>
      </footer>
    </Screen>
  );
}
