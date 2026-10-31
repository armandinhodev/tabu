import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./landing-page";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

vi.mock("next/link", async () => {
  const React = (await import("react")).default;
  return {
    default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
      React.createElement("a", { href }, children),
  };
});

vi.mock("./card-showcase-loader", async () => {
  const React = (await import("react")).default;
  return {
    CardShowcaseLoader: () =>
      React.createElement(
        "div",
        null,
        React.createElement("p", null, "fuego"),
        React.createElement("li", null, "llama"),
        React.createElement("li", null, "chimenea"),
      ),
  };
});
afterEach(cleanup);

describe("LandingPage", () => {
  it("presents one clear purpose and sends the only call to action to the playable screen", () => {
    render(<LandingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/palabra/i);

    const ctas = screen.getAllByRole("link", { name: /^jugar$/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/jugar");
    }
  });

  it("explains the rules in order without assuming prior knowledge", () => {
    render(<LandingPage />);

    const steps = screen.getByRole("list", { name: /cómo se juega/i });
    const rows = within(steps).getAllByRole("listitem");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/creá la sala/i);
    expect(rows[1]).toHaveTextContent(/describí/i);
    expect(rows[2]).toHaveTextContent(/adiviná/i);
  });

  it("shows a representative card with its forbidden words as a decorative preview", () => {
    render(<LandingPage />);

    const preview = screen.getByTestId("landing-preview");

    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview).toHaveTextContent("fuego");
    expect(preview).toHaveTextContent("llama");
    expect(preview).toHaveTextContent("chimenea");
  });

  it("summarizes the real options offered by the game and the no-signup promise", () => {
    render(<LandingPage />);

    expect(screen.getAllByText(/sin registro/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 a 4 equipos/i)).toBeInTheDocument();
    expect(screen.getByText(/30 a 120 segundos/i)).toBeInTheDocument();
    expect(screen.getByText(/1 a 6 palabras prohibidas/i)).toBeInTheDocument();
    expect(screen.getByText(/palabras adivinadas/i)).toBeInTheDocument();
  });

  it("keeps its motion safe for people who ask for less of it", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(".landing-rise");
    expect(css).toContain(".landing-float");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*landing-rise/);

    render(<LandingPage />);
    expect(screen.getByTestId("landing-preview")).toHaveClass("landing-float");
  });
});
