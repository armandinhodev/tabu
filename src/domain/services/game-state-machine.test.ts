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
  finishGame,
  isTurnExpired,
  reassignDescriptor,
  resolveTurn as resolveActiveTurn,
  skipCard,
  startGame as prepareGame,
  activateTurn,
  type TransitionContext,
} from "./GameStateMachine";

// Existing active-turn cases explicitly start the selected descriptor's clock.
function startGame(...args: Parameters<typeof prepareGame>) {
  const prepared = prepareGame(...args);
  const active = activateTurn(prepared.game, args[1]);
  return { game: active.game, events: [...prepared.events, ...active.events] };
}

function resolveTurn(...args: Parameters<typeof resolveActiveTurn>) {
  const game =
    args[0].currentTurn?.status === "pending" ? activateTurn(args[0], args[2]).game : args[0];
  return resolveActiveTurn(game, args[1], args[2]);
}

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
  it.each([10, 15])("uses the configured points target of %i", (targetScore) => {
    const active = startGame(
      makeGame({ settings: makeSettings({ mode: "points", targetScore }) }),
      makeContext(),
    ).game;
    const game = {
      ...active,
      teams: active.teams.map((team) => ({
        ...team,
        score: Score.from(team.id === active.currentTurn?.teamId ? targetScore - 2 : 0),
      })),
    };
    const below = resolveTurn(
      game,
      { kind: "CORRECT", actorId: PlayerId.from("p2") },
      makeContext(),
    );
    expect(below.game.status).toBe("playing");
    const reached = resolveTurn(
      below.game,
      { kind: "CORRECT", actorId: PlayerId.from("p2") },
      makeContext(),
    );
    expect(reached.game.status).toBe("playing");
    expect(reached.game.finalRound).toBe(1);
  });

  it.each([0, 2])(
    "recycles points games on deck exhaustion with a leading score of %i",
    (score) => {
      const active = startGame(
        makeGame({
          settings: makeSettings({ mode: "points", targetScore: 10 }),
          deck: makeDeck([makeCard("only")]),
        }),
        makeContext(),
      ).game;
      const game = {
        ...active,
        teams: active.teams.map((team, index) => ({
          ...team,
          score: Score.from(index === 0 ? score : 0),
        })),
      };
      const result = resolveTurn(game, { kind: "TIME" }, makeContext());
      expect(result.game.status).toBe("playing");
      expect(result.game.currentTurn?.card.id).toBe("only");
      expect(eventTypes(result.events)).not.toContain("GameFinished");
    },
  );

  it("keeps the full timed turn when a team reaches the points target", () => {
    const initial = makeGame({ settings: makeSettings({ mode: "points", targetScore: 10 }) });
    const active = startGame(initial, makeContext()).game;
    const game = {
      ...active,
      teams: active.teams.map((team) => ({
        ...team,
        score: Score.from(team.id === active.currentTurn?.teamId ? 9 : 0),
      })),
    };
    const result = resolveTurn(
      game,
      { kind: "CORRECT", actorId: PlayerId.from("p2") },
      makeContext(),
    );
    expect(result.game.status).toBe("playing");
    expect(result.game.finalRound).toBe(1);
    expect(result.game.currentTurn?.deadlineAt).toEqual(active.currentTurn?.deadlineAt);
    expect(result.game.finishedAt).toBeNull();
    expect(eventTypes(result.events)).not.toContain("GameFinished");
    expect(result.game.teams[0]?.score.value).toBe(10);
  });

  it("ignores the rounds limit in points mode while cards remain", () => {
    const initial = makeGame({
      settings: makeSettings({ mode: "points", targetScore: 10, rounds: 2 }),
    });
    const active = startGame(initial, makeContext()).game;
    const turn = active.currentTurn!;
    const game = { ...active, round: 2, currentTurn: { ...turn, teamId: TeamId.from("t2") } };
    const result = resolveTurn(game, { kind: "TIME" }, makeContext());
    expect(result.game.status).toBe("playing");
    expect(result.game.round).toBe(3);
  });

  it.each(["rounds", "points"] as const)("keeps playing below the target in %s mode", (mode) => {
    const active = startGame(
      makeGame({ settings: makeSettings({ mode, targetScore: 10 }) }),
      makeContext(),
    ).game;
    const result = resolveTurn(
      active,
      { kind: "CORRECT", actorId: PlayerId.from("p2") },
      makeContext(),
    );
    expect(result.game.status).toBe("playing");
    expect(eventTypes(result.events)).not.toContain("GameFinished");
  });

  it.each([1, 4, 6])("uses %i taboo words from a six-word card", (tabooWordCount) => {
    const words = ["llama", "calor", "humo", "brasa", "ceniza", "quemar"];
    const game = makeGame({
      settings: makeSettings({ tabooWordCount }),
      deck: makeDeck([makeCard("c1", "fuego", words)]),
    });

    const result = startGame(game, makeContext());
    expect(result.game.currentTurn?.card.taboo.words).toEqual(words.slice(0, tabooWordCount));
  });

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

  it("scores the answer and keeps the same timed round", () => {
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
    expect(result.game.currentTurn).toMatchObject({
      id: turn?.id,
      teamId: "t1",
      descriptorId: turn?.descriptorId,
      deadlineAt: turn?.deadlineAt,
      skipsUsed: turn?.skipsUsed,
    });
    expect(result.game.currentTurn?.card.id).not.toBe(turn?.card.id);
    expect(eventTypes(result.events)).toEqual(["CardResolved", "ScoreChanged"]);
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

  it("el descriptor salta la carta sin cerrar el turno", () => {
    const { ctx, game } = started();
    const turn = game.currentTurn;
    const deckSizeBefore = game.deck.cards.size;

    if (turn === null) {
      throw new Error("expected active turn");
    }

    const result = skipCard(game, ctx);

    // Mismo turno y mismo reloj, con otra carta robada del mazo.
    expect(result.game.currentTurn?.id).toBe(turn.id);
    expect(result.game.currentTurn?.descriptorId).toBe(turn.descriptorId);
    expect(result.game.currentTurn?.deadlineAt.getTime()).toBe(turn.deadlineAt.getTime());
    expect(result.game.currentTurn?.card.id).not.toBe(turn.card.id);
    expect(result.game.currentTurn?.skipsUsed).toBe(1);
    expect(result.game.deck.cards.size).toBe(deckSizeBefore - 1);

    // La carta skipeada se consume: no vuelve a salir en la partida.
    expect(result.game.discardedCardIds).toContain(turn.card.id);
    expect(result.game.deck.cards.remaining.some((card) => card.id === turn.card.id)).toBe(false);
    expect(eventTypes(result.events)).toContain("TurnSkipped");
  });

  it("el skip no suma ni resta puntos", () => {
    const { ctx, game } = started();

    const result = skipCard(game, ctx);

    expect(result.game.teams[0]?.score.value).toBe(0);
    expect(result.game.teams[1]?.score.value).toBe(0);
    expect(result.game.turnHistory).toHaveLength(0);
  });

  it("consume la carta cuando se agota el tiempo: no vuelve al mazo", () => {
    const { ctx, game } = started();
    const turn = game.currentTurn;

    if (turn === null) {
      throw new Error("expected active turn");
    }

    const result = resolveTurn(game, { kind: "TIME" }, ctx);

    expect(result.game.deck.cards.remaining.some((card) => card.id === turn.card.id)).toBe(false);
    expect(result.game.discardedCardIds).toContain(turn.card.id);
    expect(result.game.turnHistory[0]?.pointsDelta).toBe(0);
  });

  it("rechaza resolver sin turno activo", () => {
    const ctx = makeContext();
    const game = makeGame({ status: "playing", currentTurn: null });

    expect(() => resolveTurn(game, { kind: "TIME" }, ctx)).toThrow(TurnNotActiveError);
  });

  it("rechaza resolver en una partida que no está jugando", () => {
    const ctx = makeContext();
    const game = makeGame({
      status: "waiting",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    });

    expect(() => resolveTurn(game, { kind: "TIME" }, ctx)).toThrow(GameNotPlayingError);
  });

  it("rechaza saltar la carta sin turno activo", () => {
    const ctx = makeContext();
    const game = makeGame({ status: "playing", currentTurn: null });

    expect(() => skipCard(game, ctx)).toThrow(TurnNotActiveError);
  });

  it("rechaza saltar la carta en una partida que no está jugando", () => {
    const ctx = makeContext();
    const game = makeGame({
      status: "waiting",
      currentTurn: makeTurn({ teamId: "t1", descriptorId: "p1" }),
    });

    expect(() => skipCard(game, ctx)).toThrow(GameNotPlayingError);
  });
});

describe("cartas sin repetir", () => {
  it("ninguna carta se repite durante toda la partida, ni por skip ni por tiempo agotado", () => {
    const ctx = makeContext();
    const cards = Array.from({ length: 8 }, (_, index) => makeCard(`c${index + 1}`));
    const game = prepareGame(makeGame({ deck: makeDeck(cards) }), ctx).game;

    const dealt: string[] = [];
    let current = game;
    let step = 0;

    while (current.status === "playing") {
      const turn = current.currentTurn;

      if (turn === null) {
        break;
      }

      if (turn.status === "pending") {
        current = activateTurn(current, ctx).game;
        continue;
      }

      dealt.push(turn.card.id);
      step += 1;

      if (step % 3 === 1) {
        // Saltar consume la carta y el descriptor recibe otra del mazo.
        current = skipCard(current, ctx).game;
        continue;
      }

      if (step % 3 === 2) {
        current = resolveTurn(current, { kind: "TIME" }, ctx).game;
        continue;
      }

      current = resolveTurn(current, { kind: "CORRECT", actorId: PlayerId.from("p2") }, ctx).game;
    }

    expect(dealt.length).toBeGreaterThan(cards.length - 1);
    expect(new Set(dealt).size).toBe(dealt.length);
  });
});

describe("rondas y fin de partida", () => {
  it("honors the configured round limit when the deck is empty", () => {
    const ctx = makeContext();
    const game = makeGame({
      status: "playing",
      round: 2,
      settings: makeSettings({ rounds: 2 }),
      deck: makeDeck([]),
      currentTurn: makeTurn({ teamId: "t2", descriptorId: "p3" }),
    });

    const result = resolveTurn(game, { kind: "CORRECT", actorId: PlayerId.from("p4") }, ctx);

    expect(result.game.status).toBe("finished");
    expect(eventTypes(result.events)).toContain("RoundEnded");
  });

  it("con rounds = 1 juega hasta agotar el mazo (§6.10: 1 = mazo entero)", () => {
    const ctx = makeContext();
    const game = startGame(
      makeGame({
        deck: makeDeck([makeCard("c1"), makeCard("c2"), makeCard("c3"), makeCard("c4")]),
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

    expect(afterSecond.status).toBe("playing");
    expect(afterSecond.round).toBe(1);

    const afterThird = resolveTurn(
      afterSecond,
      { kind: "CORRECT", actorId: PlayerId.from("p1") },
      ctx,
    ).game;
    const afterFourth = resolveTurn(
      afterThird,
      { kind: "CORRECT", actorId: PlayerId.from("p3") },
      ctx,
    ).game;

    expect(afterFourth.status).toBe("finished");
    expect(afterFourth.finishedAt).not.toBeNull();
    expect(afterFourth.winnerTeamId).toBe("t1");
  });

  it("con rounds = 2 termina al completar la segunda vuelta aunque queden cartas", () => {
    const ctx = makeContext();
    const cards = Array.from({ length: 8 }, (_, index) => makeCard(`c${index + 1}`));
    const game = startGame(
      makeGame({ settings: makeSettings({ rounds: 2 }), deck: makeDeck(cards) }),
      ctx,
    ).game;

    let current = game;

    for (let index = 0; index < 3; index += 1) {
      current = resolveTurn(current, { kind: "TIME" }, ctx).game;
    }

    expect(current.status).toBe("playing");

    current = resolveTurn(current, { kind: "TIME" }, ctx).game;

    expect(current.deck.cards.isEmpty).toBe(false);
    expect(current.status).toBe("finished");
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

    const afterFirst = resolveTurn(game, { kind: "TIME" }, ctx);
    const afterSecond = resolveTurn(afterFirst.game, { kind: "TIME" }, ctx);

    expect(afterSecond.game.round).toBe(2);
    expect(afterSecond.game.status).toBe("playing");
    expect(eventTypes(afterSecond.events)).toContain("RoundEnded");
    expect(afterSecond.events.some((event) => event.type === "GameFinished")).toBe(false);
  });

  it("reinicia el contador de skips en cada turno nuevo (S4)", () => {
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

    const skipped = skipCard(game, ctx);
    expect(skipped.game.currentTurn?.skipsUsed).toBe(1);

    // El turno siguiente arranca con el contador en cero.
    const after = resolveTurn(skipped.game, { kind: "TIME" }, ctx);

    expect(after.game.currentTurn?.skipsUsed).toBe(0);
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
        deck: makeDeck([makeCard("c1"), makeCard("c2"), makeCard("c3")]),
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
      resolveTurn(afterFirst, { kind: "TIME" }, ctx).game,
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

  it("ranks every player in the match by words guessed, across both teams", () => {
    const game = makeGame({
      teams: [
        makeTeam(0, [
          makePlayer("p1", "t1", { points: 2, name: "Ana" }),
          makePlayer("p2", "t1", { points: 0, name: "Beto" }),
        ]),
        makeTeam(1, [
          makePlayer("p3", "t2", { points: 3, name: "Caro" }),
          makePlayer("p4", "t2", { points: 1, name: "Dani" }),
        ]),
      ],
    });

    const finished = finishGame(game, { now: NOW }).events.find(
      (event) => event.type === "GameFinished",
    );

    expect(finished && "ranking" in finished ? finished.ranking : null).toEqual([
      { playerId: "p3", name: "Caro", teamId: "t2", teamName: "Equipo 2", guessed: 3 },
      { playerId: "p1", name: "Ana", teamId: "t1", teamName: "Equipo 1", guessed: 2 },
      { playerId: "p4", name: "Dani", teamId: "t2", teamName: "Equipo 2", guessed: 1 },
      { playerId: "p2", name: "Beto", teamId: "t1", teamName: "Equipo 1", guessed: 0 },
    ]);
  });

  it("ranks the people who described by the cards their team solved", () => {
    const entry = (
      turnId: string,
      teamId: string,
      descriptorId: string,
      reason: "CORRECT" | "VIOLATION" | "TIME",
    ) => ({
      turnId: TurnId.from(turnId),
      teamId: TeamId.from(teamId),
      descriptorId: PlayerId.from(descriptorId),
      reason,
      pointsDelta: reason === "CORRECT" ? 1 : 0,
      cardDiscarded: reason !== "CORRECT",
      at: NOW,
    });

    const game = makeGame({
      teams: [
        makeTeam(0, [
          makePlayer("p1", "t1", { name: "Ana" }),
          makePlayer("p2", "t1", { name: "Beto" }),
        ]),
        makeTeam(1, [
          makePlayer("p3", "t2", { name: "Caro" }),
          makePlayer("p4", "t2", { name: "Dani" }),
        ]),
      ],
      turnHistory: [
        entry("turn-1", "t1", "p1", "CORRECT"),
        entry("turn-2", "t2", "p3", "CORRECT"),
        entry("turn-3", "t1", "p2", "TIME"),
        entry("turn-4", "t2", "p3", "CORRECT"),
        entry("turn-5", "t2", "p3", "VIOLATION"),
      ],
    });

    const finished = finishGame(game, { now: NOW }).events.find(
      (event) => event.type === "GameFinished",
    );
    const ranking = finished && "descriptorRanking" in finished ? finished.descriptorRanking : null;

    expect(ranking).toEqual([
      { playerId: "p3", name: "Caro", teamId: "t2", teamName: "Equipo 2", solved: 2 },
      { playerId: "p1", name: "Ana", teamId: "t1", teamName: "Equipo 1", solved: 1 },
      { playerId: "p2", name: "Beto", teamId: "t1", teamName: "Equipo 1", solved: 0 },
    ]);
    // Dani nunca describió: no tiene número que mostrar.
    expect(ranking?.some((row) => row.playerId === "p4")).toBe(false);
  });
  it("breaks ranking ties by player name so the order is stable", () => {
    const game = makeGame({
      teams: [
        makeTeam(0, [
          makePlayer("p1", "t1", { points: 1, name: "Zoe" }),
          makePlayer("p2", "t1", { points: 1, name: "Ana" }),
        ]),
      ],
    });

    const finished = finishGame(game, { now: NOW }).events.find(
      (event) => event.type === "GameFinished",
    );

    expect(
      finished && "ranking" in finished ? finished.ranking.map((row) => row.name) : null,
    ).toEqual(["Ana", "Zoe"]);
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
