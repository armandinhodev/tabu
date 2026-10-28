import { beforeEach, describe, expect, it } from "vitest";

import { GameRegistry } from "../GameRegistry";
import type { IdGenerator } from "../ports/IdGenerator";
import type { GameDeps } from "./common";
import { InMemoryDeckRepository } from "../../infrastructure/db/repositories/InMemoryDeckRepository";
import { InMemoryGameRepository } from "../../infrastructure/db/repositories/InMemoryGameRepository";
import {
  LATER,
  makeCard,
  makeDeck,
  makeGame,
  makePlayer,
  makeSettings,
} from "../../domain/__fixtures__/game";
import {
  InvalidTabooWordError,
  NotAllowedError,
  SkipLimitReachedError,
  TurnNotActiveError,
} from "../../domain/errors/DomainError";
import {
  activateTurn,
  startGame as startGameTransition,
} from "../../domain/services/GameStateMachine";
import { GameId, PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import type { Game } from "../../domain/entities/Game";
import { expireTurn, guessWord, reportViolation, skipTurn, startTurn } from "./turn";

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
  const pending = startGameTransition(waiting, {
    now,
    rng: () => 0,
    newTurnId: () => TurnId.from("turn-1"),
  });
  const started = activateTurn(pending.game, { now, rng: () => 0, newTurnId: ids.turnId });

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

describe("startTurn", () => {
  it("only allows the selected descriptor to start once with a full clock", () => {
    const harness = makeHarness();
    const turn = harness.game.currentTurn!;
    harness.deps.registry.save({ ...harness.game, currentTurn: { ...turn, status: "pending" } });
    const before = JSON.stringify(harness.deps.registry.findById(harness.game.id));
    for (const playerId of ["p2", "p3"]) {
      expect(() => startTurn(harness.deps, harness.game.id, PlayerId.from(playerId))).toThrow(
        NotAllowedError,
      );
      expect(JSON.stringify(harness.deps.registry.findById(harness.game.id))).toBe(before);
    }
    expect(expireTurn(harness.deps, harness.game.id)).toBeNull();
    expect(() =>
      guessWord(harness.deps, harness.game.id, PlayerId.from("p2"), { guess: turn.card.word }),
    ).toThrow(TurnNotActiveError);
    const now = new Date(LATER.getTime() + 600_000);
    harness.setNow(now);
    const result = startTurn(harness.deps, harness.game.id, PlayerId.from("p1"));
    expect(result.game.currentTurn).toMatchObject({
      id: turn.id,
      status: "active",
      startedAt: now,
      deadlineAt: new Date(now.getTime() + 60_000),
    });
    const active = JSON.stringify(harness.deps.registry.findById(harness.game.id));
    expect(() => startTurn(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow();
    expect(JSON.stringify(harness.deps.registry.findById(harness.game.id))).toBe(active);
  });
});

describe("guessWord", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("scores a correct card without changing the timed round", () => {
    const before = harness.game.currentTurn!;
    const result = guessWord(harness.deps, harness.game.id, PlayerId.from("p2"), {
      guess: activeWord(harness.game).toUpperCase(),
    });

    expect(result.correct).toBe(true);
    expect(result.pointsDelta).toBe(1);
    expect(result.teamScore).toBe(1);
    expect(result.events.map((event) => event.type)).toContain("ScoreChanged");
    expect(result.game.teams[0]?.score.value).toBe(1);
    expect(result.game.currentTurn).toMatchObject({
      id: before.id,
      teamId: before.teamId,
      descriptorId: before.descriptorId,
      startedAt: before.startedAt,
      deadlineAt: before.deadlineAt,
      skipsUsed: before.skipsUsed,
    });
    expect(result.game.currentTurn?.card.id).not.toBe(before.card.id);
    expect(result.events.map((event) => event.type)).not.toContain("TurnEnded");
    expect(harness.deps.registry.findById(harness.game.id)).toEqual(result.game);
  });

  it("acredita el punto al jugador que cantó el acierto", () => {
    const result = guessWord(harness.deps, harness.game.id, PlayerId.from("p2"), {
      guess: `  ${activeWord(harness.game).toUpperCase()}  `,
    });

    expect(result.game.teams[0]?.players.find((player) => player.id === "p2")?.points).toBe(1);
  });

  it("keeps the game unchanged when an active guess is wrong", () => {
    const before = JSON.stringify(harness.deps.registry.findById(harness.game.id));
    const result = guessWord(harness.deps, harness.game.id, PlayerId.from("p2"), {
      guess: "incorrecta",
    });

    expect(result.correct).toBe(false);
    expect(result.pointsDelta).toBe(0);
    expect(result.events).toEqual([]);
    expect(JSON.stringify(harness.deps.registry.findById(harness.game.id))).toBe(before);
  });

  it("rejects the descriptor even when they know the word", () => {
    expect(() =>
      guessWord(harness.deps, harness.game.id, PlayerId.from("p1"), {
        guess: activeWord(harness.game),
      }),
    ).toThrow(NotAllowedError);
  });

  it("rechaza al equipo rival", () => {
    expect(() =>
      guessWord(harness.deps, harness.game.id, PlayerId.from("p3"), { guess: "fuego" }),
    ).toThrow(NotAllowedError);
  });

  it("rechaza a un jugador sin equipo", () => {
    harness.deps.registry.save({ ...harness.game, players: [makePlayer("p9", null)] });

    expect(() =>
      guessWord(harness.deps, harness.game.id, PlayerId.from("p9"), { guess: "fuego" }),
    ).toThrow(NotAllowedError);
  });
});

describe("un solo descriptor por turno (S2)", () => {
  it("el descriptor es un único jugador y el resto del equipo adivina", () => {
    const harness = makeHarness();

    expect(harness.game.currentTurn?.descriptorId).toBe("p1");

    // El resto del equipo (p2) adivina: el descriptor no bloquea al equipo.
    const result = guessWord(harness.deps, harness.game.id, PlayerId.from("p2"), {
      guess: activeWord(harness.game),
    });

    expect(result.correct).toBe(true);
  });

  it("el descriptor rota cuando el turno pasa al equipo siguiente", () => {
    const harness = makeHarness();

    const first = harness.game.currentTurn?.descriptorId;
    expect(first).toBe("p1");

    // Cerrar el turno (por reloj) abre el del equipo rival: descriptor nuevo.
    const after = expireTurn(harness.deps, harness.game.id)!;

    expect(after.game.currentTurn?.teamId).toBe("t2");
    expect(after.game.currentTurn?.descriptorId).toBe("p3");
  });

  it("saltar la carta no cambia al descriptor", () => {
    const harness = makeHarness();

    const after = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    // El turno sigue siendo del mismo equipo y del mismo descriptor.
    expect(after.game.currentTurn?.teamId).toBe("t1");
    expect(after.game.currentTurn?.descriptorId).toBe("p1");
  });

  it("solo el descriptor actual puede pasar la carta", () => {
    const harness = makeHarness();

    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p2"))).toThrow(
      NotAllowedError,
    );
    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p3"))).toThrow(
      NotAllowedError,
    );
  });
});

describe("reportViolation", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it.each(["p1", "p2"])(
    "rejects the describing team's taboo-word report without mutation (%s)",
    (playerId) => {
      const before = JSON.stringify(harness.deps.registry.findById(harness.game.id));
      const tabooWord = harness.game.currentTurn!.card.taboo.words[0]!;
      expect(() =>
        reportViolation(harness.deps, harness.game.id, PlayerId.from(playerId), {
          reason: "TABOO_WORD",
          tabooWord,
        }),
      ).toThrow(NotAllowedError);
      expect(JSON.stringify(harness.deps.registry.findById(harness.game.id))).toBe(before);
    },
  );

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
    expect(gesture.game.currentTurn?.teamId).toBe("t1");
    expect(gesture.game.currentTurn?.descriptorId).toBe("p1");
    expect(gesture.game.currentTurn?.deadlineAt).toEqual(harness.game.currentTurn?.deadlineAt);
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

  it("el descriptor salta la carta y sigue en el mismo turno (S4)", () => {
    const skipped = harness.game.currentTurn?.card;
    const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(result.pointsDelta).toBe(0);
    expect(result.game.currentTurn?.teamId).toBe("t1");
    expect(result.game.currentTurn?.card.id).not.toBe(skipped?.id);
    expect(result.game.passedCards).toHaveLength(1);
    expect(result.game.passedCards[0]?.card.id).toBe(skipped?.id);
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

describe("límite de skips por turno (S4)", () => {
  it("el skip no resta puntos ni penaliza: 0 puntos y el turno sigue abierto", () => {
    const harness = makeHarness();

    const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(result.pointsDelta).toBe(0);
    expect(result.game.teams[0]?.score.value).toBe(0);
    expect(result.game.teams[1]?.score.value).toBe(0);
  });

  it("cuenta el skip en el contador del turno", () => {
    const harness = makeHarness();

    const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(result.game.currentTurn?.skipsUsed).toBe(1);
  });

  it("el turno sigue abierto con la misma carta nueva y el mismo reloj", () => {
    const harness = makeHarness();
    const turnBefore = harness.game.currentTurn;
    const cardBefore = turnBefore?.card.id;

    const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));
    const turnAfter = result.game.currentTurn;

    // Mismo turno, mismo descriptor, mismo reloj, otra carta.
    expect(turnAfter?.id).toBe(turnBefore?.id);
    expect(turnAfter?.descriptorId).toBe("p1");
    expect(turnAfter?.teamId).toBe(turnBefore?.teamId);
    expect(turnAfter?.deadlineAt.getTime()).toBe(turnBefore?.deadlineAt.getTime());
    expect(turnAfter?.card.id).not.toBe(cardBefore);
  });

  it("la carta skipeada pasa al rival", () => {
    const harness = makeHarness();
    const cardBefore = harness.game.currentTurn?.card.id;

    const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(result.game.passedCards).toHaveLength(1);
    expect(result.game.passedCards[0]?.card.id).toBe(cardBefore);
    expect(result.game.passedCards[0]?.toTeamId).toBe("t2");
  });

  it("permite los 3 skips del turno y rechaza el cuarto", () => {
    // Mazo con cartas de sobra: cada skip roba una y el turno sigue abierto.
    const harness = makeHarness({
      settings: makeSettings({ skipLimit: 3 }),
      deck: makeDeck([
        makeCard("c1"),
        makeCard("c2"),
        makeCard("c3"),
        makeCard("c4"),
        makeCard("c5"),
        makeCard("c6"),
      ]),
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));
      expect(result.game.currentTurn?.skipsUsed).toBe(attempt + 1);
    }

    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow(
      SkipLimitReachedError,
    );
  });

  it("un skip rechazado no cambia la carta ni el puntaje", () => {
    const harness = makeHarness({ settings: makeSettings({ skipLimit: 1 }) });

    skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    const before = harness.deps.registry.findById(harness.game.id);
    const cardBefore = before?.currentTurn?.card.id;
    const turnBefore = before?.currentTurn?.id;

    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow(
      SkipLimitReachedError,
    );

    const after = harness.deps.registry.findById(harness.game.id);

    expect(after?.currentTurn?.id).toBe(turnBefore);
    expect(after?.currentTurn?.card.id).toBe(cardBefore);
    expect(after?.teams[0]?.score.value).toBe(0);
    expect(after?.currentTurn?.skipsUsed).toBe(1);
  });

  it("el contador se reinicia en el turno siguiente", () => {
    const harness = makeHarness({ settings: makeSettings({ skipLimit: 1 }) });

    skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));
    expect(harness.deps.registry.findById(harness.game.id)?.currentTurn?.skipsUsed).toBe(1);

    // Cierra el turno: el siguiente empieza con el contador en cero.
    const after = expireTurn(harness.deps, harness.game.id);

    expect(after?.game.currentTurn?.skipsUsed).toBe(0);
  });

  it("respeta un límite configurado distinto del default", () => {
    const harness = makeHarness({ settings: makeSettings({ skipLimit: 1 }) });

    skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow(
      SkipLimitReachedError,
    );
  });

  it("con límite 0 no se puede skipear", () => {
    const harness = makeHarness({ settings: makeSettings({ skipLimit: 0 }) });

    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow(
      SkipLimitReachedError,
    );
  });
});

describe("timed round continuity", () => {
  it("allows every other teammate to guess and keeps skips used after an answer", () => {
    const harness = makeHarness({
      teams: [
        {
          ...makeGame().teams[0]!,
          players: [makePlayer("p1", "t1"), makePlayer("p2", "t1"), makePlayer("p5", "t1")],
        },
        makeGame().teams[1]!,
      ],
      settings: makeSettings({ skipLimit: 1 }),
      deck: makeDeck(
        Array.from({ length: 6 }, (_, index) => makeCard(`c${index}`, `word${index}`)),
      ),
    });
    const initial = harness.game.currentTurn!;
    skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"));

    for (const playerId of ["p2", "p5"]) {
      const current = harness.deps.registry.findById(harness.game.id)!;
      const result = guessWord(harness.deps, harness.game.id, PlayerId.from(playerId), {
        guess: activeWord(current),
      });
      expect(result.correct).toBe(true);
      expect(result.game.currentTurn).toMatchObject({
        id: initial.id,
        descriptorId: initial.descriptorId,
        teamId: initial.teamId,
        deadlineAt: initial.deadlineAt,
        skipsUsed: 1,
      });
    }
    const before = JSON.stringify(harness.deps.registry.findById(harness.game.id));
    expect(() => skipTurn(harness.deps, harness.game.id, PlayerId.from("p1"))).toThrow(
      SkipLimitReachedError,
    );
    expect(JSON.stringify(harness.deps.registry.findById(harness.game.id))).toBe(before);
    const after = expireTurn(harness.deps, harness.game.id)!;
    expect(after.game.currentTurn?.teamId).toBe("t2");
    expect(after.game.teams[0]?.score.value).toBe(2);
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

    expect(() =>
      guessWord(harness.deps, harness.game.id, PlayerId.from("p2"), { guess: "fuego" }),
    ).toThrow(TurnNotActiveError);
  });
});
