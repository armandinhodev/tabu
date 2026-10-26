/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { remainingFraction, secondsRemaining } from "./countdown";

const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

describe("secondsRemaining", () => {
  it("redondea hacia arriba para no mostrar 0 antes de tiempo", () => {
    expect(secondsRemaining(NOW + 32_400, NOW)).toBe(33);
    expect(secondsRemaining(NOW + 1, NOW)).toBe(1);
  });

  it("nunca baja de cero", () => {
    expect(secondsRemaining(NOW - 10_000, NOW)).toBe(0);
  });
});

describe("remainingFraction", () => {
  it("va de 1 al inicio a 0 en el deadline", () => {
    expect(remainingFraction(NOW + 45_000, 45, NOW)).toBe(1);
    expect(remainingFraction(NOW, 45, NOW)).toBe(0);
    expect(remainingFraction(NOW + 22_500, 45, NOW)).toBeCloseTo(0.5);
  });

  it("se clampea fuera de rango", () => {
    expect(remainingFraction(NOW + 90_000, 45, NOW)).toBe(1);
    expect(remainingFraction(NOW - 90_000, 45, NOW)).toBe(0);
  });
});
