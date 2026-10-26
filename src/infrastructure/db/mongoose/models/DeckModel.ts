import { model, models, type Model } from "mongoose";

import { deckSchema, type DeckDocument } from "../schemas/deck.schema";

export const DeckModel: Model<DeckDocument> =
  (models.Deck as Model<DeckDocument> | undefined) ?? model<DeckDocument>("Deck", deckSchema);
