"use client";

import { useMemo } from "react";

/**
 * Confeti del resultado (§7): puntos planos de 4–6px en acento, verde y oro.
 * Bajo `prefers-reduced-motion` no se renderiza (cero movimiento).
 */
export function Confetti({ count = 24 }: { readonly count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const palette = ["bg-accent", "bg-success", "bg-gold"] as const;
        const size = index % 3 === 0 ? "size-1.5" : "size-1";

        return {
          id: index,
          className: palette[index % palette.length] ?? "bg-accent",
          size,
          left: `${(index * 37) % 100}%`,
          delay: `${(index % 8) * 0.12}s`,
          duration: `${1.2 + (index % 5) * 0.1}s`,
        };
      }),
    [count],
  );

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden motion-reduce:hidden">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className={`absolute top-0 rounded-sm ${piece.size} ${piece.className}`}
          style={{
            left: piece.left,
            animation: `confetti-fall ${piece.duration} linear ${piece.delay} forwards`,
          }}
        />
      ))}
    </div>
  );
}
