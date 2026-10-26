/** Segundos restantes desde un deadline absoluto, nunca negativos (S10). */
export function secondsRemaining(deadlineAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1_000));
}

/** Fracción 0..1 del turno que falta, para el anillo del temporizador. */
export function remainingFraction(deadlineAt: number, turnSeconds: number, now = Date.now()): number {
  const total = Math.max(1, turnSeconds * 1_000);

  return Math.max(0, Math.min(1, (deadlineAt - now) / total));
}
