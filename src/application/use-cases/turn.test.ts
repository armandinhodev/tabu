import { beforeEach, describe, expect, it } from "vitest";

import { GameRegistry } from "../GameRegistry";
import type { IdGenerator } from "../ports/IdGenerator";
import type { GameDeps } from "./common";
import { InMemoryDeckRepository } from "../../infrastructure/db/repositories/InMemoryDeckRepository";
import { InMemoryGameRepository } from "../../infrastructure/db/repositories/InMemoryGameRepository";
import { LATER, makeGame, makePlayer } from "../../domain/__fixtures__/game";
import {
  InvalidTabooWordError,
  NotAllowedError,
  TurnNotActiveError,
} from "../../domain/errors/DomainError";
import { startGame as startGameTransition } from "../../domain/services/GameStateMachine";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import type { Game } from "../../domain/entities/Game";
import { expireTurn, guessWord, passTurn, reportViolation, skipTurn } from "./turn";

interface Harness {
  readonly deps: GameDeps;
  readonly game: Game;
  setNow(date: Date): void;
}

function makeHarness(overrides: Partial<Game> = {}): Harness {
  const registry = new GameRegistry();
  let now = new Date(LATER.getTime() - 30_000);
  let sequence = 0;

  const ids: IdGenerator = {
    gameId: () => GameId.from(`game-${(sequence += 1)}`),
    playerId: () => PlayerId.from(`player-${(sequence += 1)}`),
    teamId: () => TeamId.from(`team-${(sequence += 1)}`),
    turnId: () => TurnId.from(`turn-${(sequence += 1)}`),
    playerToken: () => `token-${(sequence += 1)}`,
  };

  const waiting: Game = makeGame(overrides);
  const started = startGameTransition(waiting, {
    now,
    rng: () => 0,
    newTurnId: () => TurnId.from("turn-1"),
  });

  registry.save(started.game);

  return {
    game: started.game,
    setNow: (date) => {
      now = date;
    },
    deps: {
      registry,
      decks: new InMemoryDeckRepository(),
      games: new InMemoryGameRepository(),
      clock: { now: () => now },
      ids,
      rng: () => 0,
      config: {
        maxTeams: 4,
        minPlayersPerTeam: 2,
        maxPlayersPerTeam: 8,
        turnSecondsDefault: 45,
        rounds: 1,
      },
    },
  };
}

function activeWord(game: Game): string {
  return game.currentTurn?.card.word ?? "";
}

describe("guessWord", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("suma 1 al equipo que describe y cierra el turno", () => {
    const result = guessWord(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(result.pointsDelta).toBe(1);
    expect(result.teamScore).toBe(1);
    expect(result.events.map((event) => event.type)).toContain("ScoreChanged");
    expect(result.game.teams[0]?.score.value).toBe(1);
    expect(result.game.currentTurn?.teamId).toBe("t2");
  });

  it("acredita el punto al jugador que cantó el acierto", () => {
    const result = guessWord(harness.deps, harness.game.id, PlayerId.from("p2"));

    expect(result.game.teams[0]?.players.find((player) => player.id === "p2")?.points).toBe(1);
  });

  it("rechaza al equipo rival", () => {
    expect(() => guessWord(harness.deps, harness.game.id, PlayerId.from("p3"))).toThrow(
      NotAllowedError,
    );
  });

  it("rechaza a un jugador sin equipo", () => {
    harness.deps.registry.save({ ...harness.game, players: [makePlayer("p9", null)] });

    expect(() => guessWord(harness.deps, harness.game.id, PlayerId.from("p9"))).toThrow(
      NotAllowedError,
    );
  });
});

describe("reportViolation", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("penaliza con la palabra prohibida exacta y anula la carta", () => {
    const word = harness.game.currentTurn?.card.taboo.words[0] ?? "";
    const result = reportViolation(harness.deps, harness.game.id, PlayerId.from("p3"), {
      reason: "TABOO_WORD",
      tabooWord: word,
    });

    expect(result.pointsDelta).toBe(-1);
    expect(result.game.discardedCardIds).toHaveLength(1);
    expect(
      result.events.some((event) => event.type === "PenaltyApplied" && event.cardDiscarded),
    ).toBe(true);
  });

  it("acepta la palabra normalizada (mayúsculas y acentos)", () => {
    const word = harness.game.currentTurn?.card.taboo.words[0] ?? "";
    const upper = `${word.toUpperCase()} `;

    const result = reportViolation(harness.deps, harness.game.id, PlayerId.from("p3"), {
      reason: "TABOO_WORD",
      tabooWord: upper,
    });

    expect(result.pointsDelta).toBe(-1);
  });

  it("rechaza una palabra que no está en la carta sin penalizar ni cerrar el turno", () => {
    const before = harness.deps.registry.findById(harness.game.id);

    expect(() =>
      reportViolation(harness.deps, harness.game.id, PlayerId.from("p3"), {
        reason: "TABOO_WORD",
        tabooWord: "inexistente",
      }),
    ).toThrow(InvalidTabooWordError);

    const after = harness.deps.registry.findById(harness.game.id);

    expect(after?.currentTurn?.status).toBe("active");
    expect(after?.currentTurn?.card.word).toBe(activeWord(harness.game));
    expect(after?.teams[0]?.score.value).toBe(0);
    expect(before?.discardedCardIds).toEqual(after?.discardedCardIds);
  });

  it("rechaza el reporte del compañero del descriptor", () => {
    const word = harness.game.currentTurn?.card.taboo.words[0] ?? "";

    expect(() =>
      reportViolation(harness.deps, harness.game.id, PlayerId.from("p2"), {
        reason: "TABOO_WORD",
        tabooWord: word,
      }),
    ).toThrow(NotAllowedError);
  });

  it("acepta gesto y sonido del rival", () => {
    const gesture = reportViolation(harness.deps, harness.game.id, PlayerId.from("p3"), {
      reason: "GESTURE",
    });

    expect(gesture.pointsDelta).toBe(-1);
    expect(gesture.game.currentTurn?.teamId).toBe("t2");
  });

  it("acepta el autorreporte del descriptor", () => {
    const self = reportViolation(harness.deps, harness.game.id, PlayerId.from("p1"), {
      reason: "SOUND",
    });

    expect(self.pointsDelta).toBe(-1);
  });
});

describe("skipTurn", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("acepta la carta y el rival la consume al iniciar su turno (D31)", () => {
    const skipped = harness.game.currentTurn?.card;
    const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(result.pointsDelta).toBe(0);
    expect(result.game.passedCards).toEqual([]);
    expect(result.game.currentTurn?.teamId).toBe("t2");
    expect(result.game.currentTurn?.card.id).toBe(skipped?.id);
    expect(result.game.teams[0]?.score.value).toBe(0);
  });

  it("rechaza a un compañero del descriptor", () => {
    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p2"))).toThrow(
      NotAllowedError,
    );
  });

  it("rechaza al rival", () => {
    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p3"))).toThrow(
      NotAllowedError,
    );
  });
});

describe("passTurn", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("termina el turno sin puntos y devuelve la carta al final del mazo", () => {
    const expiredCardId = harness.game.currentTurn?.card.id;
    const remainingBefore = harness.game.deck.cards.remaining.length;

    const result = passTurn(harness.deps, harness.game.id, PlayerId.from("p2"));
    const deck = result.game.deck.cards.remaining;

    expect(result.pointsDelta).toBe(0);
    expect(result.game.teams[0]?.score.value).toBe(0);
    expect(result.game.currentTurn?.teamId).toBe("t2");
    expect(deck.length).toBe(remainingBefore);
    expect(deck.at(-1)?.id).toBe(expiredCardId);
  });

  it("lo puede pedir cualquier miembro del equipo activo, no el rival", () => {
    expect(() => passTurn(harness.deps, harness.game.id, PlayerId.from("p3"))).toThrow(
      NotAllowedError,
    );
  });
});

describe("expireTurn", () => {
  it("cierra el turno por reloj, sin puntos y devuelve la carta al final del mazo", () => {
    const harness = makeHarness();
    const before = harness.deps.registry.findById(harness.game.id);
    const expiredCardId = before?.currentTurn?.card.id;
    const remainingBefore = before?.deck.cards.remaining.length ?? 0;

    harness.setNow(new Date(LATER.getTime()));

    const result = expireTurn(harness.deps, harness.game.id);
    const deck = result?.game.deck.cards.remaining ?? [];

    expect(result?.pointsDelta).toBe(0);
    expect(result?.game.teams[0]?.score.value).toBe(0);
    expect(result?.game.passedCards).toEqual([]);
    expect(deck.length).toBe(remainingBefore);
    expect(deck.at(-1)?.id).toBe(expiredCardId);
  });

  it("ignora una partida que no está jugando", () => {
    const harness = makeHarness();
    harness.deps.registry.save({ ...harness.game, status: "finished", currentTurn: null });

    expect(expireTurn(harness.deps, harness.game.id)).toBeNull();
  });

  it("rechaza acciones sin turno activo", () => {
    const harness = makeHarness();
    harness.deps.registry.save({ ...harness.game, currentTurn: null });

    expect(() => guessWord(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow(
      TurnNotActiveError,
    );
  });
});
