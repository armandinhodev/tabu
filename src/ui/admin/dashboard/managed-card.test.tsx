import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ManagedCard } from "./managed-card";
import type { CardView } from "./types";

const card: CardView = {
  id: "card-1",
  word: "fuego",
  taboo: ["llama", "hoguera", "brasa", "fogon", "chimenea", "incendio"],
  excluded: false,
  manualOverride: false,
  issues: [],
  candidates: [],
};

afterEach(cleanup);

describe("admin card actions", () => {
  it("removes AI replacement while retaining edit, exclusion and deletion", () => {
    const api = vi.fn(async () => undefined);
    render(
      <ManagedCard
        card={card}
        cards={[card]}
        deckId="deck-1"
        disabled={false}
        api={api as never}
        act={async (action) => {
          await action();
          return true;
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Reemplazar con IA" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar carta" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Eliminar carta" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(api).toHaveBeenCalledWith("/api/admin/decks/deck-1/cards/card-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded: true }),
    });
  });
});
