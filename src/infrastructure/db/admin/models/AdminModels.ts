import { model, models, type Model } from "mongoose";

import {
  adminDeckProjectionSchema,
  type AdminDeckProjectionDocument,
} from "../schemas/admin-deck-projection.schema";
import { adminDeckSchema, type AdminDeckDocument } from "../schemas/admin-deck.schema";
import { adminJobSchema, type AdminJobDocument } from "../schemas/admin-job.schema";

/** Mazos administrables (`adminDecks`). */
export const AdminDeckModel: Model<AdminDeckDocument> =
  (models.AdminDeck as Model<AdminDeckDocument> | undefined) ??
  model<AdminDeckDocument>("AdminDeck", adminDeckSchema);

/** Trabajos administrativos (`adminJobs`). */
export const AdminJobModel: Model<AdminJobDocument> =
  (models.AdminJob as Model<AdminJobDocument> | undefined) ??
  model<AdminJobDocument>("AdminJob", adminJobSchema);

/**
 * Proyección jugable de los mazos administrables. Comparte la colección
 * `decks` con los mazos sembrados, pero sólo escribe sobre sus propios
 * documentos (los identifica por `managedDeckId`).
 */
export const AdminDeckProjectionModel: Model<AdminDeckProjectionDocument> =
  (models.AdminDeckProjection as Model<AdminDeckProjectionDocument> | undefined) ??
  model<AdminDeckProjectionDocument>("AdminDeckProjection", adminDeckProjectionSchema);
