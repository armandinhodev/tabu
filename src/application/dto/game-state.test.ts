import { describe, expect, it } from "vitest";
import { makeGame, makeTurn, NOW } from "../../domain/__fixtures__/game";
import { PlayerId, TeamId, TurnId } from "../../domain/value-objects/PlayerId";
import { toGameState } from "./game-state";

describe("completed rounds per team", () => {
  it("starts at zero for every team", () => {
    expect(
      toGameState(makeGame(), PlayerId.from("p1")).teams.map((team) => team.roundsPlayed),
    ).toEqual([0, 0]);
  });

  it("counts completed timed turns, not individual cards or the active turn", () => {
    const entry = (team: string, turn: string, reason: "CORRECT" | "TIME" | "VIOLATION") => ({
      teamId: TeamId.from(team),
      turnId: TurnId.from(turn),
      descriptorId: PlayerId.from("p1"),
      reason,
      pointsDelta: reason === "CORRECT" ? 1 : 0,
      cardDiscarded: false,
      at: NOW,
    });
    const game = makeGame({
      status: "playing",
      currentTurn: makeTurn({ teamId: "t2", descriptorId: "p3" }),
      turnHistory: [
        entry("t1", "turn-1", "CORRECT"),
        entry("t1", "turn-1", "CORRECT"),
        entry("t1", "turn-1", "TIME"),
        entry("t2", "turn-2", "VIOLATION"),
        entry("t2", "turn-2", "TIME"),
        entry("t1", "turn-3", "TIME"),
        entry("t2", "turn-4", "CORRECT"),
      ],
    });
    const view = toGameState(game, PlayerId.from("p1"));
    expect(view.teams.map((team) => team.roundsPlayed)).toEqual([2, 1]);
    expect(view.teams.map((team) => team.score)).toEqual([0, 0]);
  });
});
