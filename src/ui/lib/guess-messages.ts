/**
 * Local activity feed. Guess/feedback entries are private to their author;
 * event entries are derived from existing public game events.
 */

export type GuessMessageKind =
  "guess" | "feedback" | "notice" | "skip" | "penalty" | "turn" | "score";

export interface GuessMessage {
  readonly id: number;
  readonly text: string;
  readonly kind: GuessMessageKind;
  readonly outcome?: "correct" | "incorrect";
}

export function isPublicMessage(message: GuessMessage): boolean {
  return message.kind !== "guess" && message.kind !== "feedback";
}
