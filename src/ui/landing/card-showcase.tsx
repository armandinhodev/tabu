"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useTurnPreview } from "./use-turn-preview";

const CARDS = [
  { word: "fuego", taboo: ["llama", "chimenea", "brasa", "humo"] },
  { word: "playa", taboo: ["arena", "mar", "ola", "verano"] },
  { word: "reloj", taboo: ["hora", "aguja", "tiempo", "pulsera"] },
] as const;

type SampleCard = (typeof CARDS)[number];

const TURN_SECONDS = 30;
const CARD_MS = 3_400;

const WORD_CLASS =
  "font-display text-[2rem] leading-none font-extrabold break-words text-fg uppercase";
const CHIP_CLASS =
  "rounded-pill border border-danger bg-danger-soft px-3 py-1.5 text-body-sm text-fg";

function CardFace({ card }: { readonly card: SampleCard }) {
  return (
    <>
      <p className={WORD_CLASS} data-testid="preview-word">
        {card.word}
      </p>
      <ul className="flex flex-wrap items-start gap-2">
        {card.taboo.map((word) => (
          <li key={word} className={CHIP_CLASS}>
            {word}
          </li>
        ))}
      </ul>
    </>
  );
}

function AnimatedCard({ card }: { readonly card: SampleCard }) {
  return (
    <motion.div
      key={card.word}
      className="flex flex-col gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <motion.p
        className={WORD_CLASS}
        data-testid="preview-word"
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {card.word}
      </motion.p>
      <ul className="flex flex-wrap items-start gap-2">
        {card.taboo.map((word, index) => (
          <motion.li
            key={word}
            className={CHIP_CLASS}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.05 * index, ease: "easeOut" }}
          >
            {word}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

/** Decorative preview: cards rotate while the turn clock runs. */
export function CardShowcase() {
  const reduced = useReducedMotion() ?? false;
  const { cardIndex, secondsLeft } = useTurnPreview({
    cardCount: CARDS.length,
    cardMs: CARD_MS,
    seconds: TURN_SECONDS,
    reduced,
  });
  const card = CARDS[cardIndex] ?? CARDS[0];
  const fraction = secondsLeft / TURN_SECONDS;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line-strong bg-surface-2 p-5 shadow-float">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle uppercase">Tu carta</span>
        <span
          className="rounded-pill bg-warning-soft px-2 py-1 font-mono text-caption font-semibold text-warning tabular-nums"
          data-testid="preview-clock"
        >
          {secondsLeft} s
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-pill bg-surface-3">
        <motion.div
          className="h-full origin-left rounded-pill bg-warning"
          initial={false}
          animate={{ scaleX: fraction }}
          transition={reduced ? { duration: 0 } : { duration: 1, ease: "linear" }}
        />
      </div>

      <div className="flex min-h-[9.5rem] flex-col gap-3">
        {reduced ? (
          <CardFace card={card} />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <AnimatedCard key={card.word} card={card} />
          </AnimatePresence>
        )}
      </div>

      <p className="text-body-sm text-fg-muted">Si decís una de estas, tu equipo pierde 1 punto.</p>
    </div>
  );
}
