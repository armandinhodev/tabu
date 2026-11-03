"use client";

import { AlarmClock, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { remainingFraction, secondsRemaining } from "@/ui/lib/countdown";
import { cn } from "@/ui/lib/cn";

interface TimerRingProps {
  /**
   * Deadline absoluto del turno. Sin deadline el anillo queda **en reposo**:
   * pinta el turno completo y no corre el reloj. Lo usa la landing, que sirve
   * la carta en el HTML y recién después de hidratar arranca el turno.
   */
  readonly deadlineAt: number | undefined;
  readonly turnSeconds: number;
  /** Diferencia entre el reloj del servidor y el del dispositivo, en ms. */
  readonly clockOffsetMs?: number;
  readonly className?: string;
}

const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Anillo del temporizador (§6, S25): pista y relleno en SVG, 8px de trazo.
 * Bajo 10 s cambia a `--danger` **y** cambia el ícono: nunca solo color.
 *
 * El tiempo restante se mide contra el reloj del **servidor** (`clockOffsetMs`):
 * el deadline es absoluto y si el reloj del dispositivo se desvía, el timer
 * mostraría un tiempo que no es el real.
 */
export function TimerRing({
  deadlineAt,
  turnSeconds,
  clockOffsetMs = 0,
  className,
}: TimerRingProps) {
  const now = useCallback(() => Date.now() + clockOffsetMs, [clockOffsetMs]);
  const live = deadlineAt !== undefined;
  const [remaining, setRemaining] = useState(() =>
    live ? secondsRemaining(deadlineAt, now()) : turnSeconds,
  );

  useEffect(() => {
    if (!live) {
      setRemaining(turnSeconds);
      return;
    }

    setRemaining(secondsRemaining(deadlineAt, now()));

    const timer = setInterval(() => {
      setRemaining(secondsRemaining(deadlineAt, now()));
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [deadlineAt, now, live, turnSeconds]);

  const fraction = live ? remainingFraction(deadlineAt, turnSeconds, now()) : 1;
  const urgent = remaining <= 10;
  const Icon = urgent ? AlarmClock : Timer;

  return (
    <div
      className={cn("relative grid size-[160px] place-items-center md:size-[200px]", className)}
      role="timer"
      aria-live="off"
      aria-label={`Quedan ${remaining} segundos`}
    >
      <svg viewBox="0 0 160 160" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="80"
          cy="80"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          className="stroke-surface-3"
        />
        <circle
          cx="80"
          cy="80"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={cn(
            "transition-[stroke-dashoffset,stroke] duration-200 ease-linear",
            urgent ? "stroke-danger" : "stroke-warning",
          )}
        />
      </svg>
      <div className="flex flex-col items-center gap-1">
        <Icon
          aria-hidden="true"
          className={cn("size-5", urgent ? "text-danger" : "text-warning")}
        />
        <span
          className={cn(
            "font-mono text-[2.5rem] leading-none font-bold tabular-nums",
            urgent ? "text-danger" : "text-warning",
          )}
        >
          {remaining}
        </span>
        <span className="text-micro text-fg-subtle uppercase">segundos</span>
      </div>
    </div>
  );
}
