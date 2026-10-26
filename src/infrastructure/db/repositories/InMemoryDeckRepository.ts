import type { Deck, DeckInput, DeckRepository } from "../../../application/ports/DeckRepository";

/** Repositorio de pruebas: mismos puertos, estado en memoria (L de SOLID). */
export class InMemoryDeckRepository implements DeckRepository {
  private readonly decks = new Map<string, Deck>();
  private sequence = 0;

  async findById(id: string): Promise<Deck | null> {
    return this.decks.get(id) ?? null;
  }

  async findActive(): Promise<readonly Deck[]> {
    return [...this.decks.values()].filter((deck) => deck.active);
  }

  async upsertByName(input: DeckInput): Promise<Deck> {
    const existing = [...this.decks.values()].find((deck) => deck.name === input.name);

    if (existing !== undefined) {
      const updated: Deck = {
        ...existing,
        category: input.category,
        language: input.language,
        active: input.active,
        cards: [...input.cards],
      };
      this.decks.set(existing.id, updated);
      return updated;
    }

    this.sequence += 1;
    const created: Deck = {
      id: `deck-${this.sequence}`,
      name: input.name,
      category: input.category,
      language: input.language,
      active: input.active,
      cards: [...input.cards],
      createdAt: new Date(),
    };
    this.decks.set(created.id, created);
    return created;
  }
}
