import { describe, expect, it } from "vitest";
import type { Game } from "../entities/Game";
import {
  makeCard,
  makeDeck,
  makeGame,
  makePlayer,
  makeSettings,
  makeTeam,
  NOW,
} from "../__fixtures__/game";
import { PlayerId, TurnId } from "../value-objects/PlayerId";
import { Score } from "../value-objects/Score";
import {
  activateTurn,
  resolveTurn,
  skipCard,
  startGame,
  type TransitionContext,
} from "./GameStateMachine";

let sequence = 0;
const ctx: TransitionContext = {
  now: NOW,
  rng: () => 0.99,
  newTurnId: () => TurnId.from(`fair-${++sequence}`),
};
const correct = { kind: "CORRECT", actorId: PlayerId.from("p2") } as const;
const timeout = { kind: "TIME" } as const;

function start(cards = [makeCard("a"), makeCard("b"), makeCard("c")], teamCount = 2) {
  const teams = Array.from({ length: teamCount }, (_, index) =>
    makeTeam(index, [
      makePlayer(`p${index * 2 + 1}`, `t${index + 1}`),
      makePlayer(`p${index * 2 + 2}`, `t${index + 1}`),
    ]),
  );
  return activateTurn(
    startGame(
      makeGame({
        teams,
        settings: makeSettings({ mode: "points", targetScore: 10, teamCount }),
        deck: makeDeck(cards),
      }),
      ctx,
    ).game,
    ctx,
  ).game;
}

describe("fair points rounds and deck recycling", () => {
  it.each([2, 3, 4])("gives all %i teams a full turn before choosing the winner", (teamCount) => {
    const active = start(undefined, teamCount);
    let game: Game = {
      ...active,
      teams: active.teams.map((team) => ({
        ...team,
        score: Score.from(team.id === active.currentTurn?.teamId ? 9 : 0),
      })),
    };
    game = resolveTurn(game, correct, ctx).game;
    expect(game.status).toBe("playing");
    expect(game.finalRound).toBe(1);
    for (let turn = 0; turn < teamCount; turn++) {
      const result = resolveTurn(game, timeout, ctx);
      game = result.game;
      if (turn < teamCount - 1) {
        expect(game.status).toBe("playing");
        expect(result.events.some((event) => event.type === "GameFinished")).toBe(false);
        game = activateTurn(game, ctx).game;
      }
    }
    expect(game.status).toBe("finished");
    expect(game.winnerTeamId).toBe(active.currentTurn?.teamId);
  });

  it.each([10, 11])("allows the second team to finish with %i points", (secondScore) => {
    let game = start();
    const [first, second] = [
      game.currentTurn!.teamId,
      game.teams.find((team) => team.id !== game.currentTurn!.teamId)!.id,
    ];
    game = {
      ...game,
      teams: game.teams.map((team) => ({
        ...team,
        score: Score.from(team.id === first ? 9 : secondScore - 1),
      })),
    };
    game = resolveTurn(game, correct, ctx).game;
    game = activateTurn(resolveTurn(game, timeout, ctx).game, ctx).game;
    game = resolveTurn(game, correct, ctx).game;
    expect(game.status).toBe("playing");
    const result = resolveTurn(game, timeout, ctx);
    expect(result.game.status).toBe("finished");
    expect(result.game.winnerTeamId).toBe(secondScore === 10 ? null : second);
    expect(result.events.filter((event) => event.type === "GameFinished")).toHaveLength(1);
  });

  it("replays unguessed cards once, then resets to the whole original deck repeatedly", () => {
    let game = start();
    const original = game.deck.originalCards!;
    const guessed = game.currentTurn!.card.id;
    game = resolveTurn(game, correct, ctx).game;
    const skipped = game.currentTurn!.card.id;
    game = skipCard(game, ctx).game;
    const expired = game.currentTurn!.card.id;
    game = resolveTurn(game, timeout, ctx).game;
    expect(game.status).toBe("playing");
    expect(game.deck.recyclePhase).toBe("unguessed");
    const retryIds = [
      game.currentTurn!.card.id,
      ...game.deck.cards.remaining.map((card) => card.id),
    ];
    expect(retryIds.sort()).toEqual([skipped, expired].sort());
    expect(retryIds).not.toContain(guessed);
    game = activateTurn(game, ctx).game;
    game = resolveTurn(game, correct, ctx).game;
    game = resolveTurn(game, correct, ctx).game;
    expect(game.deck.recyclePhase).toBe("full");
    expect(
      [game.currentTurn!.card.id, ...game.deck.cards.remaining.map((card) => card.id)].sort(),
    ).toEqual(original.map((card) => card.id).sort());
    for (let i = 0; i < 3; i++) game = resolveTurn(game, correct, ctx).game;
    expect(game.deck.recyclePhase).toBe("full");
    expect(game.status).toBe("playing");
    expect(
      [game.currentTurn!.card.id, ...game.deck.cards.remaining.map((card) => card.id)].sort(),
    ).toEqual(original.map((card) => card.id).sort());
  });

  it.each(["skip", "correct", "violation", "time"] as const)(
    "recycles a single-card deck after %s without losing the clock",
    (kind) => {
      const active = start([
        makeCard("only", "fuego", ["llama", "calor", "humo", "brasa", "ceniza", "quemar"]),
      ]);
      const result =
        kind === "skip"
          ? skipCard(active, ctx)
          : resolveTurn(
              active,
              kind === "correct"
                ? correct
                : kind === "time"
                  ? timeout
                  : {
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
      expect(result.game.status).toBe("playing");
      expect(result.game.currentTurn?.card.id).toBe("only");
      expect(result.game.deck.originalCards?.[0]?.taboo.words).toHaveLength(6);
      if (kind !== "time")
        expect(result.game.currentTurn?.deadlineAt).toEqual(active.currentTurn?.deadlineAt);
      expect(result.events.some((event) => event.type === "GameFinished")).toBe(false);
    },
  );
});
