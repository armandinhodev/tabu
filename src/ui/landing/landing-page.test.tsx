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
    default: ({
      href,
      children,
      className,
    }: {
      href: string;
      children?: React.ReactNode;
      className?: string;
    }) => React.createElement("a", { href, className }, children),
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
  it("uses the reference headline and offers distinct create and join entry points", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Decí todo. Menos la palabra prohibida.",
    );
    expect(screen.getByRole("link", { name: "Crear sala" })).toHaveAttribute(
      "href",
      "/jugar?accion=crear",
    );
    expect(screen.getByRole("link", { name: "Unirme con código" })).toHaveAttribute(
      "href",
      "/jugar?accion=unirse",
    );
    expect(screen.getByRole("link", { name: "Crear una sala" })).toHaveAttribute(
      "href",
      "/jugar?accion=crear",
    );
    expect(screen.getByText("Sin descargas")).toBeVisible();
    expect(screen.getByText("En tiempo real")).toBeVisible();
  });

  it("keeps the illustration responsive and scoped to landing paper tokens", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/landing/landing-page.module.css"), "utf8");
    expect(css).toContain("var(--landing-paper)");
    expect(css).toContain("var(--accent)");
    expect(css).toContain("grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr)");
    expect(css).toContain("@media (min-width: 768px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain('.previewTimer > [role="timer"]');
    expect(css).toContain(".cardBody :global(li > span)");
    expect(css).toContain(".brand > span:first-child");
    expect(css).toContain("@media (max-width: 374px)");
    expect(css).not.toMatch(/#[\da-f]{3,8}\b/i);
  });

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
    expect(rows[2]).toHaveTextContent(/sumá/i);
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
    expect(screen.getByText(/2–4 equipos/i)).toBeInTheDocument();
    expect(screen.getByText(/30–120 s por turno/i)).toBeInTheDocument();
    expect(screen.getByText(/1–6 palabras prohibidas/i)).toBeInTheDocument();
    expect(screen.getByText(/palabras adivinadas/i)).toBeInTheDocument();
  });

  it("keeps its motion safe for people who ask for less of it", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(".landing-reveal");
    expect(css).toContain(".landing-float");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*landing-float[\s\S]*landing-reveal/,
    );

    render(<LandingPage />);
    expect(screen.getByTestId("landing-preview")).toHaveClass("landing-float");
  });

  it("revela cada bloque cuando entra en la ventana y no al cargar", () => {
    render(<LandingPage />);

    const sections = document.querySelectorAll(".landing-reveal");
    expect(sections.length).toBeGreaterThan(1);

    // La mejora es progresiva: sin JavaScript el bloque se ve igual.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("@media (scripting: enabled)");
  });

  it("takes the call to action styles from the shared button", () => {
    render(<LandingPage />);

    const cta = screen.getByRole("link", { name: "Crear sala" });
    expect(cta.className).toContain("bg-accent");
    expect(cta.className).toContain("text-on-accent");
    expect(cta.className).toContain("min-h-14");
  });

  it("moves the focus with the anchor and leaves the rules out of a floating button", () => {
    render(<LandingPage />);

    const anchor = screen.getByRole("link", { name: /cómo se juega/i });
    expect(anchor).toHaveAttribute("href", "#como-se-juega");

    const target = document.getElementById("como-se-juega");
    expect(target).not.toBeNull();
    expect(target?.className).toContain("scroll-mt-24");
    expect(screen.getByRole("heading", { name: "Tres pasos. Muchas risas." })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    // Las reglas de la casa viven en el encabezado y en el pie, no flotando.
    expect(screen.getAllByRole("button", { name: /reglas/i })).toHaveLength(2);
    expect(document.querySelector(".fixed")).toBeNull();
  });

  it("closes the page with a footer that offers the rules and the game", () => {
    render(<LandingPage />);

    const footer = document.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole("link", { name: /^jugar$/i })).toHaveAttribute(
      "href",
      "/jugar",
    );
    expect(
      within(footer as HTMLElement).getByRole("button", { name: /reglas/i }),
    ).toBeInTheDocument();
  });
});
