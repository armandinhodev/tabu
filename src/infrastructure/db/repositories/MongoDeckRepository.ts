import { Types } from "mongoose";

import type { Deck, DeckInput, DeckRepository } from "../../../application/ports/DeckRepository";
import { toDeckDocument, toDeckDomain } from "../mappers/deck-mapper";
import { DeckModel } from "../mongoose/models/DeckModel";

export class MongoDeckRepository implements DeckRepository {
  async findById(id: string): Promise<Deck | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const document = await DeckModel.findById(id).exec();

    return document === null ? null : toDeckDomain(document, String(document._id));
  }

  async findActive(): Promise<readonly Deck[]> {
    const documents = await DeckModel.find({ active: true })
      .sort({ name: 1 })
      .exec();

    return documents.map((document) => toDeckDomain(document, String(document._id)));
  }

  async upsertByName(input: DeckInput): Promise<Deck> {
    const document = await DeckModel.findOneAndUpdate(
      { name: input.name },
      { $set: toDeckDocument(input) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    if (document === null) {
      throw new Error(`Could not upsert deck "${input.name}"`);
    }

    return toDeckDomain(document, String(document._id));
  }
}
