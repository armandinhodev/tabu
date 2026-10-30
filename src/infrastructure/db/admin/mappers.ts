import type {
  AdminCandidate,
  AdminJob,
  ManagedCard,
  ManagedDeck,
} from "../../../application/admin/types";
import type {
  AdminCardDocument,
  AdminCandidateDocument,
  AdminDeckDocument,
} from "./schemas/admin-deck.schema";
import type { AdminJobDocument } from "./schemas/admin-job.schema";

/** Convierte un candidato del DTO al documento. */
export function toCandidateDocument(candidate: AdminCandidate): AdminCandidateDocument {
  return {
    word: candidate.word,
    recognized: candidate.recognized,
    valid: candidate.valid,
    ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
  };
}

/** Convierte una carta del DTO al documento. */
export function toCardDocument(card: ManagedCard): AdminCardDocument {
  return {
    id: card.id,
    word: card.word,
    taboo: [...card.taboo],
    excluded: card.excluded,
    manualOverride: card.manualOverride,
    issues: [...card.issues],
    candidates: card.candidates.map(toCandidateDocument),
    ...(card.sourceJobId === undefined ? {} : { sourceJobId: card.sourceJobId }),
    ...(card.sourceIndex === undefined ? {} : { sourceIndex: card.sourceIndex }),
    ...(card.overrideAt === undefined ? {} : { overrideAt: new Date(card.overrideAt) }),
    createdAt: new Date(card.createdAt),
    updatedAt: new Date(card.updatedAt),
  };
}

/** Convierte una carta del documento al DTO. */
export function toManagedCard(document: AdminCardDocument): ManagedCard {
  return {
    id: document.id,
    word: document.word,
    taboo: [...document.taboo],
    excluded: document.excluded,
    manualOverride: document.manualOverride,
    issues: [...document.issues],
    candidates: document.candidates.map((candidate) => ({
      word: candidate.word,
      recognized: candidate.recognized,
      valid: candidate.valid,
      ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
    })),
    ...(document.sourceJobId === undefined ? {} : { sourceJobId: document.sourceJobId }),
    ...(document.sourceIndex === undefined ? {} : { sourceIndex: document.sourceIndex }),
    ...(document.overrideAt === undefined ? {} : { overrideAt: document.overrideAt.toISOString() }),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/** Convierte un mazo del documento al DTO. */
export function toManagedDeck(document: AdminDeckDocument): ManagedDeck {
  return {
    ...(document.rules === undefined ? {} : { rules: document.rules }),
    ...(document.allowProperNames === undefined
      ? {}
      : { allowProperNames: document.allowProperNames }),
    id: String(document._id),
    name: document.name,
    theme: document.theme,
    language: document.language,
    cards: document.cards.map(toManagedCard),
    revision: document.revision,
    usedObjectives: [...document.usedObjectives],
    proposedWords: [...document.proposedWords],
    publicDeckId: document.publicDeckId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    // El archivado sólo aparece cuando el mazo está archivado: un mazo
    // activo no lleva el campo.
    ...(document.archivedAt === undefined ? {} : { archivedAt: document.archivedAt.toISOString() }),
  };
}

/** Convierte un trabajo del documento al DTO. */
export function toManagedJob(document: AdminJobDocument): AdminJob {
  return {
    ...(document.model === undefined ? {} : { model: document.model }),
    id: String(document._id),
    deckId: document.deckId,
    kind: document.kind,
    status: document.status,
    ...(document.targetCardId === undefined ? {} : { targetCardId: document.targetCardId }),
    requested: document.requested,
    processed: document.processed,
    ...(document.error === undefined ? {} : { error: document.error }),
    inputTokens: document.inputTokens,
    outputTokens: document.outputTokens,
    calls: document.calls,
    attempts: document.attempts,
    maxCalls: document.maxCalls,
    maxAttempts: document.maxAttempts,
    batchSize: document.batchSize,
    leaseMs: document.leaseMs,
    objectives: [...document.objectives],
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    ...(document.startedAt === undefined ? {} : { startedAt: document.startedAt.toISOString() }),
    ...(document.finishedAt === undefined ? {} : { finishedAt: document.finishedAt.toISOString() }),
  };
}
