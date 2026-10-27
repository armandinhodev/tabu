import { describe, expect, it } from "vitest";

import {
  LATER,
  NOW,
  makeCard,
  makeGame,
  makePlayer,
  makeTeam,
  makeTurn,
} from "../__fixtures__/game";
import {
  GameNotPlayingError,
  InvalidTabooWordError,
  NoEligibleDescriptorError,
  NotAllowedError,
  TurnNotActiveError,
} from "../errors/DomainError";
import { PlayerId, TeamId } from "../value-objects/PlayerId";
import { Score } from "../value-objects/Score";
import { reporterRole, validateReport } from "./PenaltyPolicy";
import { pointsForOutcome, scoreAfterOutcome } from "./ScoringPolicy";
import { nextDescriptor, nextTeam } from "./TurnOrderPolicy";

describe("ScoringPolicy", () => {
  it("asigna +1 al acierto, -1 a la infracción y 0 al timeout", () => {
    expect(pointsForOutcome("CORRECT")).toBe(1);
    expect(pointsForOutcome("VIOLATION")).toBe(-1);
    expect(pointsForOutcome("TIME")).toBe(0);
  });

  it("aplica el puntaje sin bajar de cero", () => {
    expect(scoreAfterOutcome(Score.from(0), "CORRECT").value).toBe(1);
    expect(scoreAfterOutcome(Score.from(0), "VIOLATION").value).toBe(0);
    expect(scoreAfterOutcome(Score.from(2), "VIOLATION").value).toBe(1);
    expect(scoreAfterOutcome(Score.from(5), "TIME").value).toBe(5);
  });
});

describe("TurnOrderPolicy", () => {
  const teamA = makeTeam(0, [makePlayer("p1", "t1"), makePlayer("p2", "t1")]);
  const teamB = makeTeam(1, [makePlayer("p3", "t2"), makePlayer("p4", "t2")]);
  const teamC = makeTeam(2, [makePlayer("p5", "t3"), makePlayer("p6", "t3")]);
  const teams = [teamA, teamB, teamC];

  it("rota por equipo en orden y vuelve al primero", () => {
    expect(nextTeam(teams, null).id).toBe(teamA.id);
    expect(nextTeam(teams, TeamId.from("t1")).id).toBe(teamB.id);
    expect(nextTeam(teams, TeamId.from("t2")).id).toBe(teamC.id);
    expect(nextTeam(teams, TeamId.from("t3")).id).toBe(teamA.id);
  });

  it("rota el descriptor en FIFO dentro del equipo", () => {
    const first = nextDescriptor(teamA);
    expect(first.descriptorId).toBe("p1");
    expect(first.team.turnCursor).toBe(1);

    const second = nextDescriptor(first.team);
    expect(second.descriptorId).toBe("p2");
    expect(second.team.turnCursor).toBe(0);
  });

  it("saltea jugadores desconectados y avanza el cursor", () => {
    const team = makeTeam(0, [
      makePlayer("p1", "t1", { connected: false }),
      makePlayer("p2", "t1"),
      makePlayer("p3", "t1", { connected: false }),
    ]);

    const result = nextDescriptor(team);
    expect(result.descriptorId).toBe("p2");
    expect(result.team.turnCursor).toBe(2);
  });

  it("falla si nadie del equipo está conectado", () => {
    const team = makeTeam(0, [makePlayer("p1", "t1", { connected: false })]);
    expect(() => nextDescriptor(team)).toThrow(NoEligibleDescriptorError);
  });
});

describe("PenaltyPolicy", () => {
  const turn = makeTurn({
    teamId: "t1",
    descriptorId: "p1",
    card: makeCard("c1", "fuego", ["fuego", "calor"]),
  });
  const game = makeGame({ status: "playing", currentTurn: turn });

  it("identifica el rol del reportante", () => {
    expect(reporterRole(game, turn, PlayerId.from("p1"))).toBe("DESCRIBER");
    expect(reporterRole(game, turn, PlayerId.from("p2"))).toBe("ACTIVE");
    expect(reporterRole(game, turn, PlayerId.from("p3"))).toBe("RIVAL");
    expect(reporterRole(game, turn, PlayerId.from("outsider"))).toBe("OUTSIDER");
  });

  it("acepta el reporte del rival y normaliza la palabra marcada", () => {
    const violation = validateReport(
      game,
      turn,
      { reason: "TABOO_WORD", tabooWord: "FUEGO" },
      { reporterId: PlayerId.from("p3"), at: NOW },
    );

    expect(violation.reason).toBe("TABOO_WORD");
    expect(violation.reason === "TABOO_WORD" ? violation.tabooWord : null).toBe("fuego");
    expect(violation.reportedBy).toBe("p3");
  });

  it("acepta el autorreporte del descriptor", () => {
    const violation = validateReport(
      game,
      turn,
      { reason: "TABOO_WORD", tabooWord: "calor" },
      { reporterId: PlayerId.from("p1"), at: NOW },
    );
    expect(violation.reason).toBe("TABOO_WORD");
  });

  it("acepta gestos y sonidos del rival y del descriptor", () => {
    expect(
      validateReport(
        game,
        turn,
        { reason: "GESTURE" },
        { reporterId: PlayerId.from("p3"), at: NOW },
      ).reason,
    ).toBe("GESTURE");
    expect(
      validateReport(game, turn, { reason: "SOUND" }, { reporterId: PlayerId.from("p1"), at: NOW })
        .reason,
    ).toBe("SOUND");
  });

  it("rechaza al compañero de equipo que no describe y a un ajeno", () => {
    expect(() =>
      validateReport(
        game,
        turn,
        { reason: "GESTURE" },
        { reporterId: PlayerId.from("p2"), at: NOW },
      ),
    ).toThrow(NotAllowedError);

    expect(() =>
      validateReport(
        game,
        turn,
        { reason: "GESTURE" },
        { reporterId: PlayerId.from("outsider"), at: NOW },
      ),
    ).toThrow(NotAllowedError);
  });

  it("rechaza una palabra que no está en la carta sin cerrar el turno", () => {
    expect(() =>
      validateReport(
        game,
        turn,
        { reason: "TABOO_WORD", tabooWord: "agua" },
        { reporterId: PlayerId.from("p3"), at: NOW },
      ),
    ).toThrow(InvalidTabooWordError);
  });

  it("rechaza reportes fuera de partida", () => {
    expect(() =>
      validateReport(
        { ...game, status: "waiting" },
        turn,
        { reason: "GESTURE" },
        { reporterId: PlayerId.from("p3"), at: NOW },
      ),
    ).toThrow(GameNotPlayingError);
  });

  it("rechaza reportes sin turno activo", () => {
    expect(() =>
      validateReport(
        game,
        { ...turn, status: "ended" },
        { reason: "GESTURE" },
        { reporterId: PlayerId.from("p3"), at: LATER },
      ),
    ).toThrow(TurnNotActiveError);
  });
});
