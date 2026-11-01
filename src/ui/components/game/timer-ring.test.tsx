import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TimerRing } from "./timer-ring";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

it("muestra el tiempo restante del turno", () => {
  const deadlineAt = Date.now() + 30_000;

  render(<TimerRing deadlineAt={deadlineAt} turnSeconds={60} />);

  expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 30 segundos");
});

it("mide contra el reloj del servidor y no contra el del dispositivo", () => {
  const deadlineAt = Date.now() + 30_000;

  // El servidor va 30 s adelante: el turno ya venció para él, aunque el
  // dispositivo todavía muestre 30 s.
  render(<TimerRing deadlineAt={deadlineAt} turnSeconds={60} clockOffsetMs={30_000} />);

  expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 0 segundos");
});

it("con el reloj del dispositivo desfasado, el anillo marca lo que queda de verdad", () => {
  const deadlineAt = Date.now() + 90_000;

  render(<TimerRing deadlineAt={deadlineAt} turnSeconds={90} clockOffsetMs={30_000} />);

  expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Quedan 60 segundos");
});
