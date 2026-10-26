import type { CardId } from "../value-objects/PlayerId";
import type { TabooWords } from "../value-objects/TabooWords";

export interface Card {
  readonly id: CardId;
  readonly word: string;
  readonly taboo: TabooWords;
}
