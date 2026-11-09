"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { TabooWords } from "@/ui/components/game/taboo-words";
import { TimerRing } from "@/ui/components/game/timer-ring";
import { useTurnPreview } from "./use-turn-preview";
import styles from "./landing-page.module.css";
import CARDS from "./example-cards.json";

const LAST_CARD_KEY = "tabu.landing.last-card";

/**
 * Several cards share one compressed round. Only the round resets the clock.
 */
const TURN_SECONDS = 15;
const TURN_MS = TURN_SECONDS * 1_000;

const WORD_CLASS = "font-display text-h1 font-extrabold break-words text-fg uppercase";

/**
 * Decorative preview of a real turn.
 *
 * It uses the game's own components — the forbidden words and the timer ring —
 * so the landing shows several cards sharing the same round clock.
 */
export function CardShowcase() {
  const reduced = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const [startOffset, setStartOffset] = useState(0);

  useEffect(() => {
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(LAST_CARD_KEY);
    } catch {
      // Storage is optional; private browsing must still show a random example.
    }
    const candidates = CARDS.filter((candidate) => candidate.word !== previous);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? CARDS[0]!;
    setStartOffset(CARDS.indexOf(chosen));
    setMounted(true);
  }, []);

  const { cardIndex, deadlineAt, started } = useTurnPreview({
    cardCount: CARDS.length,
    turnMs: TURN_MS,
    cardMs: 4_000,
    reduced,
    enabled: mounted,
  });

  const card = CARDS[(startOffset + cardIndex) % CARDS.length] ?? CARDS[0]!;

  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(LAST_CARD_KEY, card.word);
    } catch {
      // The preview still works when browser storage is unavailable.
    }
  }, [mounted, card.word]);

  return (
    <div className={styles.demoCard}>
      <span className={styles.speech}>{card.hint}</span>
      <div className={styles.previewTimer}>
        <TimerRing
          deadlineAt={started ? deadlineAt : undefined}
          turnSeconds={TURN_SECONDS}
          className="size-20"
        />
      </div>
      <p className={styles.cardHeading}>Tu palabra</p>
      <div className={styles.cardBody}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={card.word}
            className="flex flex-col gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <p className={`${WORD_CLASS} ${styles.cardWord}`} data-testid="preview-word">
              {card.word}
            </p>
            <p className="text-center font-display text-body-sm font-extrabold uppercase">
              No podés decir
            </p>
            <TabooWords words={card.taboo} variant="informative" />
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="sr-only">Si decís una de estas, tu equipo pierde 1 punto.</p>
    </div>
  );
}
