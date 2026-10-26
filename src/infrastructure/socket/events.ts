import type {
  GameStateView,
  SettingsView,
  TeamView,
} from "../../application/dto/game-state";
import type { ViolationReason } from "../../domain/entities/Violation";

/**
 * Nombres y tipos del contrato Socket.IO (§8, S17). Es el único lugar donde
 * viven los strings de los eventos: handlers, broadcaster y cliente importan de
 * acá, así un typo no puede compilar.
 */

export const CLIENT_EVENTS = {
  gameCreate: "game:create",
  gameJoin: "game:join",
  gameReconnect: "game:reconnect",
  gameAssignTeam: "game:assignTeam",
  gameAutoTeams: "game:autoTeams",
  gameReady: "game:ready",
  gameStart: "game:start",
  gameLeave: "game:leave",
  turnGuess: "turn:guess",
  turnReportViolation: "turn:reportViolation",
  turnSkip: "turn:skip",
} as const;

export const SERVER_EVENTS = {
  gameState: "game:state",
  gamePlayersUpdated: "game:playersUpdated",
  gameStarted: "game:started",
  gameFinished: "game:finished",
  turnStarted: "turn:started",
  turnTick: "turn:tick",
  turnEnded: "turn:ended",
  penaltyApplied: "penalty:applied",
  scoreUpdated: "score:updated",
  roundEnded: "round:ended",
  gameError: "game:error",
} as const;

export interface ErrorPayload {
  readonly code: string;
  readonly message: string;
}

/** Error de una acción: viaja en el ack y como `game:error` al mismo socket. */
export interface ErrorAck {
  readonly error: ErrorPayload;
}

export type Ack<T> = (response: T | ErrorAck) => void;

export interface CreateGameAck {
  readonly gameId: string;
  readonly code: string;
  readonly playerToken: string;
  readonly playerId: string;
}

export interface JoinGameAck {
  readonly gameId: string;
  readonly playerToken: string;
  readonly playerId: string;
  readonly playerName: string;
}

export interface ReconnectAck {
  readonly state: GameStateView;
}

export interface GuessAck {
  readonly pointsAwarded: number;
  readonly teamScore: number;
}

export interface ReportViolationAck {
  readonly pointsDelta: number;
  readonly teamScore: number;
}

export interface StandingView {
  readonly teamId: string;
  readonly name: string;
  readonly score: number;
}

export interface ScoreTeamView {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly color: string;
}

export interface GameStartedView {
  readonly startedAt: number;
  readonly settings: SettingsView;
}

export interface TurnStartedView {
  readonly turnId: string;
  readonly teamId: string;
  readonly descriptorId: string;
  readonly word: string;
  readonly taboo: readonly string[];
  readonly deadlineAt: number;
  readonly turnSeconds: number;
}

export interface TurnEndedView {
  readonly turnId: string;
  readonly reason: "CORRECT" | "VIOLATION" | "SKIPPED" | "TIME";
  readonly pointsDelta: number;
  readonly teamId: string;
  readonly cardDiscarded: boolean;
}

export interface PenaltyAppliedView {
  readonly reason: ViolationReason;
  readonly tabooWord?: string;
  readonly teamId: string;
  readonly pointsDelta: number;
  readonly reportedBy: string;
  readonly cardDiscarded: true;
}

export interface GameFinishedView {
  readonly winnerTeamId: string | null;
  readonly standings: readonly StandingView[];
  readonly mvp: { readonly playerId: string; readonly name: string; readonly points: number } | null;
}

export interface RoundEndedView {
  readonly round: number;
  readonly standings: readonly StandingView[];
}

export interface ServerToClientEvents {
  "game:state": (payload: GameStateView) => void;
  "game:playersUpdated": (payload: { readonly teams: readonly TeamView[] }) => void;
  "game:started": (payload: GameStartedView) => void;
  "game:finished": (payload: GameFinishedView) => void;
  "turn:started": (payload: TurnStartedView) => void;
  "turn:tick": (payload: { readonly remaining: number }) => void;
  "turn:ended": (payload: TurnEndedView) => void;
  "penalty:applied": (payload: PenaltyAppliedView) => void;
  "score:updated": (payload: { readonly teams: readonly ScoreTeamView[] }) => void;
  "round:ended": (payload: RoundEndedView) => void;
  "game:error": (payload: ErrorPayload) => void;
}

export interface ClientToServerEvents {
  "game:create": (
    payload: unknown,
    ack: Ack<CreateGameAck>,
  ) => void;
  "game:join": (payload: unknown, ack: Ack<JoinGameAck>) => void;
  "game:reconnect": (payload: unknown, ack: Ack<ReconnectAck>) => void;
  "game:assignTeam": (payload: unknown, ack: Ack<void>) => void;
  "game:autoTeams": (ack: Ack<void>) => void;
  "game:ready": (ack: Ack<void>) => void;
  "game:start": (ack: Ack<void>) => void;
  "game:leave": (ack: Ack<void>) => void;
  "turn:guess": (ack: Ack<GuessAck>) => void;
  "turn:reportViolation": (payload: unknown, ack: Ack<ReportViolationAck>) => void;
  "turn:skip": (ack: Ack<void>) => void;
}
