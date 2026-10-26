import { describe, expect, it } from "vitest";

import {
  NOW,
  LATER,
  makeCard,
  makeDeck,
  makeGame,
  makePlayer,
  makeSettings,
  makeTeam,
  makeTurn,
} from "../__fixtures__/game";
import {
  DeckEmptyError,
  GameAlreadyStartedError,
  GameNotPlayingError,
  InvalidSettingsError,
  InvalidStateError,
  TooFewPlayersError,
  TurnNotActiveError,
} from "../errors/DomainError";
import { PlayerId, TeamId, TurnId } from "../value-objects/PlayerId";
import { Score } from "../value-objects/Score";
import type { DomainEvent } from "../events/events";
import {
  beginTurn,
  isTurnExpired,
  reassignDescriptor,
  resolveTurn,
  startGame,
  type TransitionContext,
} from "./GameStateMachine";

function makeContext(overrides: Partial<TransitionContext> = {}): TransitionContext {
  let counter = 0;
  return {
    now: NOW,
    rng: () => 0,
    newTurnId: () => {
      counter += 1;
      return TurnId.from(`turn-${counter}`);
    },
    ...overrides,
  };
}

function eventTypes(events: readonly DomainEvent[]): readonly string[] {
  return events.map((event) => event.type);
}

describe("startGame", () => {
  it("pasa a playing, baraja el mazo y arranca el primer turno", () => {
    const ctx = makeContext();
    const result = startGame(makeGame(), ctx);
    const turn = result.game.currentTurn;

    expect(result.game.status).toBe("playing");
    expect(result.game.round).toBe(1);
    expect(turn).not.toBeNull();
    expect(turn?.teamId).toBe("t1");
    expect(turn?.descriptorId).toBe("p1");
    expect(turn?.status).toBe("active");
    expect(result.game.deck.cards.size).toBe(2);
    expect(eventTypes(result.events)).toEqual(["GameStarted", "TurnStarted"]);

    const turnStarted = result.events.find((event) => event.type === "TurnStarted");
    expect(turnStarted && "word" in turnStarted ? turnStarted.word : null).toBe(turn?.card.word);
    expect(turnStarted && "taboo" in turnStarted ? turnStarted.taboo : null).toEqual([
      "llama",
      "calor",
    ]);
  });

  it("rechaza arrancar dos veces", () => {
    const ctx = makeContext();
    const started = startGame(makeGame(), ctx);
    expect(() => startGame(started.game, ctx)).toThrow(GameAlreadyStartedError);
  });

  it("exige el mínimo de jugadores por equipo", () => {
    const game = makeGame({
      teams: [
        makeTeam(0, [makePlayer("p1", "t1")]),
        makeTeam(1, [makePlayer("p2", "t2"), makePlayer("p3", "t2")]),
      ],
    });

    expect(() => startGame(game, makeContext())).toThrow(TooFewPlayersError);
  });

  it("exige un mazo con cartas", () => {
    const game = makeGame({ deck: makeDeck([]) });
    expect(() => startGame(game, makeContext())).toThrow(DeckEmptyError);
  });

  it("exige que la cantidad de equipos coincida con la configuración", () => {
    const game = makeGame({ settings: makeSettings({ teamCount: 3 }) });
    expect(() => startGame(game, makeContext())).toThrow(InvalidSettingsError);
  });

  it("exige que todos los jugadores tengan equipo", () => {
    const game = makeGame({
      teams: [
        makeTeam(0, [makePlayer("p1", "t1"), makePlayer("p2", null)]),
        makeTeam(1, [makePlayer("p3", "t2"), makePlayer("p4", "t2")]),
      ],
    });

    expect(() => startGame(game, makeContext())).toThrow(InvalidStateError);
  });

  it("rechaza arrancar con jugadores sin equipo cuando el reparto es manual", () => {
    const game = makeGame({ players: [makePlayer("p5", null)] });

    expect(() => startGame(game, makeContext())).toThrow(InvalidStateError);
  });

  it("reparte los jugadores sin equipo cuando randomTeams está activo", () => {
    const game = makeGame({
      settings: makeSettings({ randomTeams: true }),
      players: [makePlayer("p5", null), makePlayer("p6", null)],
    });

    const result = startGame(game, makeContext());
    const assigned = result.game.teams.flatMap((team) => team.players.map((player) => player.id));

    expect(result.game.players).toEqual([]);
    expect(assigned).toContain("p5");
    expect(assigned).toContain("p6");
    expect(result.game.teams.map((team) => team.players.length)).toEqual([3, 3]);
    expect(
      result.game.teams.every((team) => team.players.every((player) => player.teamId === team.id)),
    ).toBe(true);
  });
});

describe("resolveTurn", () => {
  function started(overrides: Parameters<typeof makeGame>[0] = {}) {
    const ctx = makeContext();
    const game = startGame(makeGame(overrides), ctx).game;
    return { ctx, game };
  }

  it("suma 1 al equipo y al jugador que acertó, y arranca el turno rival", () => {
    const { ctx, game } = started();
    const turn = game.currentTurn;
    expect(turn).not.toBeNull();

    const result = resolveTurn(game, { kind: "CORRECT", actorId: PlayerId.from("p1") }, ctx);

    const team = result.game.teams.find((candidate) => candidate.id === TeamId.from("t1"));
    const scorer = team?.players.find((player) => player.id === PlayerId.from("p1"));

    expect(team?.score.value).toBe(1);
    expect(scorer?.points).toBe(1);
    expect(result.game.turnHistory).toHaveLength(1);
    expect(result.game.turnHistory[0]?.reason).toBe("CORRECT");
    expect(result.game.currentTurn?.teamId).toBe("t2");
    expect(eventTypes(result.events)).toEqual(["TurnEnded", "ScoreChanged", "TurnStarted"]);
  });

  it("resta 1, descarta la carta y no la vuelve a repartir", () => {
    const { ctx, game } = started({
      teams: [
        makeTeam(0, [makePlayer("p1", "t1"), makePlayer("p2", "t1")], { score: Score.from(3) }),
        makeTeam(1, [makePlayer("p3", "t2"), makePlayer("p4", "t2")]),
      ],
    });
    const turn = game.currentTurn;

    if (turn === null) {
      throw new Error("expected active turn");
    }

    const result = resolveTurn(
      game,
      {
        kind: "VIOLATION",
        violation: {
          reason: "TABOO_WORD",
          tabooWord: "llama",
          reportedBy: PlayerId.from("p3"),
          at: NOW,
        },
      },
      ctx,
    );

    const team = result.game.teams.find((candidate) => candidate.id === TeamId.from("t1"));

    expect(team?.score.value).toBe(2);
    expect(result.game.discardedCardIds).toContain(turn.card.id);
    expect(result.game.deck.cards.remaining.some((card) => card.id === turn.card.id)).toBe(false);
    expect(result.game.turnHistory[0]?.cardDiscarded).toBe(true);
    expect(eventTypes(result.events)).toContain("PenaltyApplied");

    const penalty = result.events.find((event) => event.type === "PenaltyApplied");
    expect(penalty && "tabooWord" in penalty ? penalty.tabooWord : null).toBe("llama");
    expect(penalty && "cardDiscarded" in penalty ? penalty.cardDiscarded : null).toBe(true);
  });

  it("pasa la carta al equipo rival cuando el descriptor acepta", () => {
    const { ctx, game } = started();
    const turn = game.currentTurn;
    const deckSizeBefore = game.deck.cards.size;

    if (turn === null) {
      throw new Error("expected active turn");
    }

    const result = resolveTurn(game, { kind: "SKIPPED" }, ctx);

    // El equipo rival arranca su turno con la carta pasada: no se roba del mazo.
    expect(result.game.currentTurn?.teamId).toBe("t2");
    expect(result.game.currentTurn?.card.id).toBe(turn.card.id);
    expect(result.game.deck.cards.size).toBe(deckSizeBefore);
    expect(result.game.passedCards).toHaveLength(0);
    expect(result.game.turnHistory[0]?.reason).toBe("SKIPPED");
  });

  it("devuelve la carta al final del mazo cuando se agota el tiempo", () => {
    const { ctx, game } = started();
    const turn = game.currentTurn;

    if (turn === null) {
      throw new Error("expected active turn");
    }

    const result = resolveTurn(game, { kind: "TIME" }, ctx);
    const lastCard = result.game.deck.cards.remaining.at(-1);

    expect(lastCard?.id).toBe(turn.card.id);
    expect(result.game.discardedCardIds).toHaveLength(0);
    expect(result.game.turnHistory[0]?.pointsDelta).toBe(0);
  });

  it("rechaza resolver sin turno activo", () => {
    const ctx = makeContext();
    const game = makeGame({ status: "playing", currentTurn: null });

    expect(() => resolveTurn(game, { kind: "SKIPPED" }, ctx)).toThrow(TurnNotActiveError);
  });

  it("rechaza resolver en una partida que no está jugando", () => {
    const ctx = makeContext();
    const game = makeGame({
      status: "waiting",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    });

    expect(() => resolveTurn(game, { kind: "SKIPPED" }, ctx)).toThrow(GameNotPlayingError);
  });
});

describe("rondas y fin de partida", () => {
  it("cierra la ronda y termina la partida al completar las rondas configuradas", () => {
    const ctx = makeContext();
    const game = startGame(
      makeGame({
        deck: makeDeck([makeCard("c1"), makeCard("c2"), makeCard("c3"), makeCard("c4")]),
      }),
      ctx,
    ).game;

    const afterFirst = resolveTurn(game, { kind: "SKIPPED" }, ctx).game;
    const afterSecond = resolveTurn(afterFirst, { kind: "SKIPPED" }, ctx).game;

    expect(afterSecond.status).toBe("finished");
    expect(afterSecond.finishedAt).not.toBeNull();
    expect(afterSecond.winnerTeamId).toBeNull();
  });

  it("avanza de ronda y sigue jugando cuando quedan rondas", () => {
    const ctx = makeContext();
    const game = startGame(
      makeGame({
        settings: makeSettings({ rounds: 2 }),
        deck: makeDeck([
          makeCard("c1"),
          makeCard("c2"),
          makeCard("c3"),
          makeCard("c4"),
          makeCard("c5"),
          makeCard("c6"),
        ]),
      }),
      ctx,
    ).game;

    const afterFirst = resolveTurn(game, { kind: "SKIPPED" }, ctx);
    const afterSecond = resolveTurn(afterFirst.game, { kind: "SKIPPED" }, ctx);

    expect(afterSecond.game.round).toBe(2);
    expect(afterSecond.game.status).toBe("playing");
    expect(eventTypes(afterSecond.events)).toContain("RoundEnded");
    expect(afterSecond.events.some((event) => event.type === "GameFinished")).toBe(false);
  });

  it("termina cuando se agota el mazo y no quedan cartas pasadas", () => {
    const ctx = makeContext();
    const game = startGame(makeGame({ deck: makeDeck([makeCard("c1")]) }), ctx).game;
    const result = resolveTurn(game, { kind: "CORRECT", actorId: PlayerId.from("p1") }, ctx);

    expect(result.game.status).toBe("finished");
    expect(result.game.winnerTeamId).toBe(TeamId.from("t1"));
    expect(eventTypes(result.events)).toContain("GameFinished");
    expect(result.game.currentTurn).toBeNull();
  });

  it("declara empate cuando los puntajes son iguales", () => {
    const ctx = makeContext();
    const game = startGame(
      makeGame({
        deck: makeDeck([makeCard("c1"), makeCard("c2")]),
        teams: [
          makeTeam(0, [makePlayer("p1", "t1"), makePlayer("p2", "t1")], { score: Score.from(2) }),
          makeTeam(1, [makePlayer("p3", "t2"), makePlayer("p4", "t2")], { score: Score.from(2) }),
        ],
      }),
      ctx,
    ).game;

    const afterFirst = resolveTurn(
      game,
      { kind: "CORRECT", actorId: PlayerId.from("p1") },
      ctx,
    ).game;
    const afterSecond = resolveTurn(
      afterFirst,
      { kind: "CORRECT", actorId: PlayerId.from("p3") },
      ctx,
    ).game;

    expect(afterSecond.status).toBe("finished");
    expect(afterSecond.winnerTeamId).toBeNull();
  });

  it("elige MVP al jugador con más puntos", () => {
    const ctx = makeContext();
    const game = startGame(makeGame({ deck: makeDeck([makeCard("c1")]) }), ctx).game;

    const result = resolveTurn(game, { kind: "CORRECT", actorId: PlayerId.from("p2") }, ctx);
    const finished = result.events.find((event) => event.type === "GameFinished");

    expect(finished && "mvp" in finished ? finished.mvp?.playerId : null).toBe("p2");
    expect(finished && "mvp" in finished ? finished.mvp?.points : null).toBe(1);
  });
});

describe("beginTurn", () => {
  it("rechaza iniciar un turno con otro turno activo", () => {
    const ctx = makeContext();
    const game = startGame(makeGame(), ctx).game;

    expect(() => beginTurn(game, ctx)).toThrow(InvalidStateError);
  });
});

describe("reassignDescriptor", () => {
  it("pasa el turno al siguiente descriptor conectado del mismo equipo sin cambiar la carta", () => {
    const started = startGame(makeGame(), makeContext());
    const withDisconnected = {
      ...started.game,
      teams: started.game.teams.map((team) =>
        team.id !== "t1"
          ? team
          : {
              ...team,
              players: team.players.map((player) =>
                player.id === "p1" ? { ...player, connected: false } : player,
              ),
            },
      ),
    };

    const next = reassignDescriptor(withDisconnected);

    expect(next.currentTurn?.descriptorId).toBe("p2");
    expect(next.currentTurn?.teamId).toBe("t1");
    expect(next.currentTurn?.card.word).toBe(started.game.currentTurn?.card.word);
    expect(next.currentTurn?.deadlineAt).toEqual(started.game.currentTurn?.deadlineAt);
  });

  it("rechaza reasignar sin turno activo", () => {
    expect(() => reassignDescriptor(makeGame())).toThrow(TurnNotActiveError);
  });
});

describe("isTurnExpired", () => {
  it("compara contra el deadline absoluto", () => {
    const turn = makeTurn({ teamId: "t1", descriptorId: "p1", deadlineAt: LATER });

    expect(isTurnExpired(turn, NOW)).toBe(false);
    expect(isTurnExpired(turn, LATER)).toBe(true);
  });
});
