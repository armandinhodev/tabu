import { Schema } from "mongoose";
import { MAX_TABOO_WORDS } from "../../../../domain/value-objects/TabooWords";
import { DEFAULT_SKIP_LIMIT, DEFAULT_TABOO_WORD_COUNT } from "../../../../domain/entities/GameSettings";

export type GameStatusDocument = "waiting" | "playing" | "finished";
export type TurnOutcomeDocument = "CORRECT" | "VIOLATION" | "SKIPPED" | "TIME";

export interface GameDeckCardDocument {
  id: string;
  word: string;
  taboo: string[];
}

export interface GameDeckSnapshotDocument {
  name: string;
  cards: GameDeckCardDocument[];
}

export interface GameSettingsDocument {
  teamCount: number;
  turnSeconds: number;
  tabooWordCount: number;
  /** Skips por ronda (S4). Ausente en partidas guardadas antes de esta regla. */
  skipLimit?: number;
  rounds: number;
  randomTeams: boolean;
  minPlayersPerTeam: number;
}

export interface GamePlayerDocument {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  /** Puntos individuales para el MVP (D4). */
  points: number;
  /** Último contacto conocido; lo usa el traspaso de host (D8). */
  lastSeenAt: Date | null;
}

export interface GameTeamDocument {
  id: string;
  name: string;
  color: string;
  score: number;
  turnCursor: number;
  players: GamePlayerDocument[];
}

export interface GameTurnDocument {
  id: string;
  teamId: string;
  descriptorId: string;
  cardId: string;
  word: string;
  taboo: string[];
  startedAt: Date;
  deadlineAt: Date;
  status: "active" | "ended";
}

export interface GamePassedCardDocument {
  cardId: string;
  word: string;
  taboo: string[];
  toTeamId: string;
}

export interface GameTurnHistoryDocument {
  turnId: string;
  teamId: string;
  descriptorId: string;
  reason: TurnOutcomeDocument;
  pointsDelta: number;
  cardDiscarded: boolean;
  at: Date;
}

export interface GameDocument {
  gameId: string;
  code: string;
  status: GameStatusDocument;
  /** El agregado en memoria todavía no arrastra el id del mazo; queda null hasta fase 3 (D33). */
  deckId: null;
  deckSnapshot: GameDeckSnapshotDocument;
  settings: GameSettingsDocument;
  teams: GameTeamDocument[];
  /** Jugadores sin equipo durante el lobby (§6.3, D35). */
  players: GamePlayerDocument[];
  turnOrder: string[];
  currentTurn: GameTurnDocument | null;
  discardedCardIds: string[];
  passedCards: GamePassedCardDocument[];
  turnHistory: GameTurnHistoryDocument[];
  round: number;
  /** Skips consumidos en la ronda actual (S4). */
  skipsUsed?: number;
  winnerTeamId: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

/** Campos que el mapper entrega; `updatedAt` lo administra Mongoose. */
export type GameDocumentInput = Omit<GameDocument, "updatedAt">;

const cardFields = {
  id: { type: String, required: true, trim: true },
  word: { type: String, required: true, trim: true },
  taboo: {
    type: [String],
    required: true,
    validate: {
      validator: (words: string[]) => words.length >= 1 && words.length <= MAX_TABOO_WORDS,
      message: `taboo must contain between 1 and ${MAX_TABOO_WORDS} words`,
    },
  },
} as const;

const deckCardSchema = new Schema<GameDeckCardDocument>(cardFields, {
  _id: false,
  versionKey: false,
});

const deckSnapshotSchema = new Schema<GameDeckSnapshotDocument>(
  {
    name: { type: String, required: true, trim: true },
    cards: { type: [deckCardSchema], required: true },
  },
  { _id: false, versionKey: false },
);

const settingsSchema = new Schema<GameSettingsDocument>(
  {
    teamCount: { type: Number, required: true, min: 2, max: 4 },
    turnSeconds: { type: Number, required: true, min: 1 },
    tabooWordCount: { type: Number, required: true, min: 1, max: 6, default: DEFAULT_TABOO_WORD_COUNT },
    skipLimit: { type: Number, min: 0, max: 10, default: DEFAULT_SKIP_LIMIT },
    rounds: { type: Number, required: true, min: 1 },
    randomTeams: { type: Boolean, required: true },
    minPlayersPerTeam: { type: Number, required: true, min: 1 },
  },
  { _id: false, versionKey: false },
);

const playerSchema = new Schema<GamePlayerDocument>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    isHost: { type: Boolean, required: true },
    connected: { type: Boolean, required: true },
    points: { type: Number, required: true, min: 0, default: 0 },
    lastSeenAt: { type: Date, default: null },
  },
  { _id: false, versionKey: false },
);

const teamSchema = new Schema<GameTeamDocument>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0 },
    turnCursor: { type: Number, required: true, min: 0, default: 0 },
    players: { type: [playerSchema], required: true },
  },
  { _id: false, versionKey: false },
);

const turnSchema = new Schema<GameTurnDocument>(
  {
    id: { type: String, required: true, trim: true },
    teamId: { type: String, required: true, trim: true },
    descriptorId: { type: String, required: true, trim: true },
    cardId: { type: String, required: true, trim: true },
    word: { type: String, required: true, trim: true },
    taboo: { type: [String], required: true },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    status: { type: String, required: true, enum: ["active", "ended"] },
  },
  { _id: false, versionKey: false },
);

const passedCardSchema = new Schema<GamePassedCardDocument>(
  {
    cardId: { type: String, required: true, trim: true },
    word: { type: String, required: true, trim: true },
    taboo: { type: [String], required: true },
    toTeamId: { type: String, required: true, trim: true },
  },
  { _id: false, versionKey: false },
);

const turnHistorySchema = new Schema<GameTurnHistoryDocument>(
  {
    turnId: { type: String, required: true, trim: true },
    teamId: { type: String, required: true, trim: true },
    descriptorId: { type: String, required: true, trim: true },
    reason: { type: String, required: true, enum: ["CORRECT", "VIOLATION", "SKIPPED", "TIME"] },
    pointsDelta: { type: Number, required: true },
    cardDiscarded: { type: Boolean, required: true },
    at: { type: Date, required: true },
  },
  { _id: false, versionKey: false },
);

export const gameSchema = new Schema<GameDocument>(
  {
    gameId: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ["waiting", "playing", "finished"] },
    deckId: { type: Schema.Types.ObjectId, default: null },
    deckSnapshot: { type: deckSnapshotSchema, required: true },
    settings: { type: settingsSchema, required: true },
    teams: { type: [teamSchema], required: true },
    players: { type: [playerSchema], required: true, default: [] },
    turnOrder: { type: [String], required: true },
    currentTurn: { type: turnSchema, default: null },
    discardedCardIds: { type: [String], required: true, default: [] },
    passedCards: { type: [passedCardSchema], required: true, default: [] },
    turnHistory: { type: [turnHistorySchema], required: true, default: [] },
    round: { type: Number, required: true, min: 1, default: 1 },
    skipsUsed: { type: Number, required: true, min: 0, default: 0 },
    winnerTeamId: { type: String, default: null },
    createdAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
  },
  { collection: "games", timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);

gameSchema.index({ code: 1 }, { unique: true });
gameSchema.index({ status: 1, createdAt: -1 });
