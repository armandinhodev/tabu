"use client";

import { AlarmClock, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import { remainingFraction, secondsRemaining } from "@/ui/lib/countdown";
import { cn } from "@/ui/lib/cn";

interface TimerRingProps {
  readonly deadlineAt: number;
  readonly turnSeconds: number;
  readonly className?: string;
}

const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Anillo del temporizador (§6, S25): pista y relleno en SVG, 8px de trazo.
 * Bajo 10 s cambia a `--danger` **y** cambia el ícono: nunca solo color.
 */
export function TimerRing({ deadlineAt, turnSeconds, className }: TimerRingProps) {
  const [remaining, setRemaining] = useState(() => secondsRemaining(deadlineAt));

  useEffect(() => {
    setRemaining(secondsRemaining(deadlineAt));

    const timer = setInterval(() => {
      setRemaining(secondsRemaining(deadlineAt));
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [deadlineAt]);

  const fraction = remainingFraction(deadlineAt, turnSeconds);
  const urgent = remaining <= 10;
  const Icon = urgent ? AlarmClock : Timer;

  return (
    <div
      className={cn("relative grid place-items-center size-[160px] md:size-[200px]", className)}
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
            "font-mono text-[2.5rem] font-bold leading-none tabular-nums",
            urgent ? "text-danger" : "text-warning",
          )}
        >
          {remaining}
        </span>
        <span className="text-micro uppercase text-fg-subtle">segundos</span>
      </div>
    </div>
  );
}
