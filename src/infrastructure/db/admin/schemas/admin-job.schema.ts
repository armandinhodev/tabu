import { Schema } from "mongoose";

/**
 * Trabajo administrativo persistido (`adminJobs`).
 *
 * El trabajo es durable: presupuesto, progreso y checkpoint viven acá, así que
 * reiniciar el proceso no reinicia el trabajo ni lo deja looping.
 */
export interface AdminJobDocument {
  /** Id estable del trabajo (lo genera la aplicación). */
  _id: string;
  deckId: string;
  kind: "generate" | "replace";
  status: "queued" | "running" | "completed" | "failed";
  /**
   * Id del mazo mientras el trabajo está activo. El índice único y disperso
   * garantiza un solo trabajo activo por mazo.
   */
  activeKey?: string;
  /**
   * Admisión interna: el trabajo está esperando su activación y todavía no es
   * ejecutable. Los trabajos anteriores al archivado no tienen la marca y
   * siguen siendo reclamables.
   */
  admissionPending?: boolean;
  targetCardId?: string;
  requested: number;
  processed: number;
  /** Objetivos ya convertidos en carta (checkpoint idempotente). */
  objectives: string[];
  attempts: number;
  calls: number;
  maxCalls: number;
  maxAttempts: number;
  batchSize: number;
  leaseMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
  leaseOwner?: string;
  /** Token de fencing: sube en cada reclamo. */
  fencingToken: number;
  leaseExpiresAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const adminJobSchema = new Schema<AdminJobDocument>(
  {
    // El id lo genera la aplicación: se declara para que no sea un ObjectId.
    _id: { type: String, required: true },
    deckId: { type: String, required: true },
    kind: { type: String, required: true, enum: ["generate", "replace"] },
    status: {
      type: String,
      required: true,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    activeKey: { type: String, required: false },
    admissionPending: { type: Boolean, required: false },
    targetCardId: { type: String, required: false },
    requested: { type: Number, required: true },
    processed: { type: Number, required: true, default: 0 },
    objectives: { type: [String], required: true, default: [] },
    attempts: { type: Number, required: true, default: 0 },
    calls: { type: Number, required: true, default: 0 },
    maxCalls: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    batchSize: { type: Number, required: true },
    leaseMs: { type: Number, required: true },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    error: { type: String, required: false },
    leaseOwner: { type: String, required: false },
    fencingToken: { type: Number, required: true, default: 0 },
    leaseExpiresAt: { type: Date, required: false },
    startedAt: { type: Date, required: false },
    finishedAt: { type: Date, required: false },
  },
  {
    collection: "adminJobs",
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
  },
);

// Un solo trabajo activo por mazo: el índice falla si se inserta otro.
adminJobSchema.index({ activeKey: 1 }, { unique: true, sparse: true });
adminJobSchema.index({ status: 1, createdAt: 1 });
adminJobSchema.index({ deckId: 1, status: 1 });
