"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { TabooWords } from "@/ui/components/game/taboo-words";
import { TimerRing } from "@/ui/components/game/timer-ring";
import { useTurnPreview } from "./use-turn-preview";

const CARDS = [
  { word: "fuego", taboo: ["llama", "chimenea", "brasa", "humo"] },
  { word: "playa", taboo: ["arena", "mar", "ola", "verano"] },
  { word: "reloj", taboo: ["hora", "aguja", "tiempo", "pulsera"] },
] as const;

/**
 * The preview plays a compressed turn: long enough for the clock to reach its
 * urgent state (under ten seconds, §9) and short enough to see a whole turn.
 */
const TURN_SECONDS = 15;
const TURN_MS = TURN_SECONDS * 1_000;

const WORD_CLASS = "font-display text-h1 font-extrabold break-words text-fg uppercase";

/**
 * Decorative preview of a real turn.
 *
 * It uses the game's own components — the forbidden words and the timer ring —
 * so the landing shows the game as it is, and it changes when the turn ends,
 * the way a turn does.
 */
export function CardShowcase() {
  const reduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { cardIndex, deadlineAt, started } = useTurnPreview({
    cardCount: CARDS.length,
    turnMs: TURN_MS,
    reduced,
    enabled: mounted,
  });

  const card = CARDS[cardIndex] ?? CARDS[0];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line-strong bg-surface-2 p-5 shadow-float">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle uppercase">Tu carta</span>
        <TimerRing
          deadlineAt={started ? deadlineAt : undefined}
          turnSeconds={TURN_SECONDS}
          className="size-28"
        />
      </div>

      <div className="min-h-[9.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={card.word}
            className="flex flex-col gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <p className={WORD_CLASS} data-testid="preview-word">
              {card.word}
            </p>
            <TabooWords words={card.taboo} variant="informative" />
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="text-body-sm text-fg-muted">Si decís una de estas, tu equipo pierde 1 punto.</p>
    </div>
  );
}
