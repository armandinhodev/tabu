import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingMotion } from "./landing-motion";

/**
 * El script de la landing es inline: corre durante el parseo del HTML, o sea
 * **antes** de que React hidrate. Si toca una clase que React controla, la
 * hidratación falla y React reescribe el `className` sin ella, dejando el
 * bloque en `opacity: 0` para siempre (el observer ya lo dejó de observar).
 *
 * Por eso el script marca con atributos (`data-*`) y no con clases: React no
 * renderiza esos atributos, así que no hay nada que comparar.
 */
class FakeObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

function readCss(): string {
  return readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
}

/** Ejecuta el script inline como lo hace el navegador durante el parseo. */
function runLandingScript(): void {
  const { container } = render(<LandingMotion />);
  const source = container.querySelector("script")?.innerHTML ?? "";
  const script = document.createElement("script");
  script.textContent = source;
  document.body.appendChild(script);
}

describe("landing motion", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    vi.unstubAllGlobals();
  });

  it("marca cada bloque con un atributo y no con una clase que React controla", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);

    const block = document.createElement("section");
    block.className = "landing-reveal";
    document.body.appendChild(block);

    runLandingScript();

    expect(block.getAttribute("data-reveal")).toBe("visible");
    expect(block.classList.contains("is-visible")).toBe(false);
    expect(block.className).toBe("landing-reveal");
  });

  it("pausa la flotación con un atributo y no con una clase que React controla", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });

    // El script corta si no hay bloques que revelar, así que hace falta uno.
    const block = document.createElement("section");
    block.className = "landing-reveal";
    document.body.appendChild(block);

    const card = document.createElement("div");
    card.className = "landing-float";
    document.body.appendChild(card);

    runLandingScript();

    expect(card.getAttribute("data-float")).toBe("paused");
    expect(card.classList.contains("is-paused")).toBe(false);
    expect(card.className).toBe("landing-float");
  });

  it("deja el CSS apuntando a los atributos que escribe el script", () => {
    const css = readCss();

    expect(css).toContain('.landing-reveal[data-reveal="visible"]');
    expect(css).toContain('.landing-float[data-float="paused"]');
    expect(css).not.toContain(".landing-reveal.is-visible");
    expect(css).not.toContain(".landing-float.is-paused");
  });
});
