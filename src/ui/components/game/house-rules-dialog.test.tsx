import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TEST_HOUSE_RULES } from "@/ui/__fixtures__/house-rules";
import { HouseRulesDialog } from "./house-rules-dialog";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

afterEach(cleanup);

it("muestra las reglas de la casa con su autor y su intro", () => {
  render(<HouseRulesDialog open onOpenChange={vi.fn()} rules={TEST_HOUSE_RULES} />);

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Reglas de la casa")).toBeVisible();
  expect(screen.getByText(TEST_HOUSE_RULES.intro)).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(TEST_HOUSE_RULES.rules.length);
  expect(screen.getByText("No digas abreviaturas.")).toBeVisible();
});

it("hace entrar cada regla escalonada y con el movimiento del sistema", () => {
  render(<HouseRulesDialog open onOpenChange={vi.fn()} rules={TEST_HOUSE_RULES} />);

  const rows = screen.getAllByRole("listitem");

  expect(rows[0]).toHaveClass("rules-rise");
  expect(rows[0]).toHaveStyle({ animationDelay: "120ms" });
  expect(rows[1]).toHaveStyle({ animationDelay: "190ms" });
});

it("se abre más ancho en pantallas grandes", () => {
  render(<HouseRulesDialog open onOpenChange={vi.fn()} rules={TEST_HOUSE_RULES} />);

  const dialog = screen.getByRole("dialog");

  expect(dialog).toHaveClass("max-w-sm", "sm:max-w-md", "lg:max-w-lg");
});

it("deja solo el cambio de opacidad cuando se pide menos movimiento", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.rules-rise[\s\S]*rules-fade/,
  );
});
