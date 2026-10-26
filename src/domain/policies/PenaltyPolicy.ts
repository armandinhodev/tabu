import type { Game } from "../entities/Game";
import type { Turn } from "../entities/Turn";
import type { Violation, ViolationInput } from "../entities/Violation";
import {
  GameNotPlayingError,
  InvalidTabooWordError,
  NotAllowedError,
  TurnNotActiveError,
} from "../errors/DomainError";
import type { PlayerId } from "../value-objects/PlayerId";
import { normalizeWord } from "../value-objects/TabooWords";

export type ReporterRole = "DESCRIBER" | "ACTIVE" | "RIVAL" | "OUTSIDER";

export function reporterRole(game: Game, turn: Turn, reporterId: PlayerId): ReporterRole {
  if (turn.descriptorId === reporterId) {
    return "DESCRIBER";
  }

  const team = game.teams.find((candidate) =>
    candidate.players.some((player) => player.id === reporterId),
  );

  if (team === undefined) {
    return "OUTSIDER";
  }

  return team.id === turn.teamId ? "ACTIVE" : "RIVAL";
}

export interface ReportMeta {
  readonly reporterId: PlayerId;
  readonly at: Date;
}

/**
 * Regla completa de reporte: solo el equipo rival o el descriptor pueden
 * reportar; una palabra prohibida debe pertenecer a la carta activa. Un reporte
 * inválido no penaliza ni cierra el turno: lanza error.
 */
export function validateReport(
  game: Game,
  turn: Turn,
  input: ViolationInput,
  meta: ReportMeta,
): Violation {
  if (game.status !== "playing") {
    throw new GameNotPlayingError(game.status);
  }

  if (turn.status !== "active") {
    throw new TurnNotActiveError();
  }

  const role = reporterRole(game, turn, meta.reporterId);

  if (role !== "RIVAL" && role !== "DESCRIBER") {
    throw new NotAllowedError("Only the rival team or the descriptor can report");
  }

  if (input.reason === "TABOO_WORD") {
    if (!turn.card.taboo.contains(input.tabooWord)) {
      throw new InvalidTabooWordError(input.tabooWord);
    }

    return {
      reason: "TABOO_WORD",
      tabooWord: normalizeWord(input.tabooWord),
      reportedBy: meta.reporterId,
      at: meta.at,
    };
  }

  return {
    reason: input.reason,
    reportedBy: meta.reporterId,
    at: meta.at,
  };
}
