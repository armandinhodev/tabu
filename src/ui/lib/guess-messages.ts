/**
 * Local activity feed. Feedback entries are private to their author; event
 * entries and written answers are shared with the whole room.
 */

export type GuessMessageKind =
  "feedback" | "notice" | "written" | "skip" | "penalty" | "turn" | "score" | "adjust";

export interface GuessMessage {
  readonly id: number;
  readonly text: string;
  readonly kind: GuessMessageKind;
  readonly outcome?: "correct" | "incorrect";
  /** Nombre de quien escribió el mensaje. */
  readonly author?: string;
}

export function isPublicMessage(message: GuessMessage): boolean {
  return message.kind !== "feedback";
}
