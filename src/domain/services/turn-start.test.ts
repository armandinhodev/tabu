import { describe, expect, it } from "vitest";

import { NOW, makeGame, makePlayer, makeTeam, makeSettings } from "../__fixtures__/game";
import { TurnId } from "../value-objects/PlayerId";
import { activateTurn, isTurnExpired, resolveTurn, startGame } from "./GameStateMachine";

function context(rng = () => 0.99, now = NOW) {
  let sequence = 0;
  return { rng, now, newTurnId: () => TurnId.from(`random-turn-${++sequence}`) };
}

describe("randomized turns with explicit start", () => {
  it.each([2, 3, 4])(
    "alternates %i teams and gives every teammate a turn before repeating",
    (teamCount) => {
      const ctx = context();
      const teams = Array.from({ length: teamCount }, (_, index) =>
        makeTeam(index, [
          makePlayer(`p${index}-a`, `t${index + 1}`),
          makePlayer(`p${index}-b`, `t${index + 1}`),
        ]),
      );
      let game = startGame(makeGame({ teams, settings: makeSettings({ teamCount }) }), ctx).game;
      const selected = new Map<string, string[]>();
      for (let index = 0; index < teamCount * 4; index += 1) {
        const turn = game.currentTurn!;
        expect(turn.teamId).toBe(`t${((teamCount - 1 + index) % teamCount) + 1}`);
        selected.set(turn.teamId, [...(selected.get(turn.teamId) ?? []), turn.descriptorId]);
        game = resolveTurn(activateTurn(game, ctx).game, { kind: "TIME" }, ctx).game;
      }
      for (const ids of selected.values()) {
        expect(new Set(ids.slice(0, 2)).size).toBe(2);
        expect(new Set(ids.slice(2, 4)).size).toBe(2);
      }
    },
  );

  it("draws the first team and descriptor and waits without starting the timer", () => {
    const result = startGame(makeGame(), context());
    expect(result.game.currentTurn).toMatchObject({
      teamId: "t2",
      descriptorId: "p4",
      status: "pending",
    });
    expect(result.events.map((event) => event.type)).toEqual(["GameStarted"]);
    expect(isTurnExpired(result.game.currentTurn!, new Date(NOW.getTime() + 600_000))).toBe(false);
  });

  it("starts the full clock only on activation, then alternates teams with another pending turn", () => {
    const ctx = context();
    const pending = startGame(makeGame(), ctx).game;
    const later = new Date(NOW.getTime() + 600_000);
    const active = activateTurn(pending, { ...ctx, now: later });
    expect(active.game.currentTurn).toMatchObject({
      status: "active",
      startedAt: later,
      deadlineAt: new Date(later.getTime() + 60_000),
    });
    expect(active.events.map((event) => event.type)).toEqual(["TurnStarted"]);
    const next = resolveTurn(
      active.game,
      { kind: "TIME" },
      { ...ctx, now: new Date(later.getTime() + 60_000) },
    );
    expect(next.game.currentTurn).toMatchObject({ teamId: "t1", status: "pending" });
    expect(next.events.map((event) => event.type)).not.toContain("RoundEnded");
    const second = activateTurn(next.game, ctx);
    const third = resolveTurn(second.game, { kind: "TIME" }, ctx);
    expect(third.game.currentTurn).toMatchObject({
      teamId: "t2",
      descriptorId: "p3",
      status: "pending",
    });
    expect(third.events.map((event) => event.type)).toContain("RoundEnded");
  });
});
