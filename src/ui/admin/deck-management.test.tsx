import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

import { DeckManagement, type AdminDeckView, type DeckManagementProps } from "./deck-management";

const deck: AdminDeckView = {
  id: "deck-1",
  name: "General",
  theme: "Objetos",
  cards: [],
};

const archivedDeck: AdminDeckView = { ...deck, archivedAt: "2026-10-29T12:00:00.000Z" };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderManagement(overrides: Partial<DeckManagementProps> = {}) {
  const api = vi.fn(async () => ({ id: "deck-1" }));
  const act = vi.fn(async (action: () => Promise<void>) => {
    await action();
  });
  const onArchived = vi.fn();
  const onDeleted = vi.fn();

  const view = render(
    <DeckManagement
      deck={deck}
      busy={false}
      running={false}
      api={api as unknown as DeckManagementProps["api"]}
      act={act}
      onArchived={onArchived}
      onDeleted={onDeleted}
      {...overrides}
    />,
  );

  return { api, act, onArchived, onDeleted, rerender: view.rerender };
}

describe("DeckManagement", () => {
  it("loads and saves multiline rules and theme, and allows clearing the rules", async () => {
    const { api } = renderManagement({
      deck: { ...deck, ...{ rules: "Common associations.\nNo obscure terms." } },
    });
    const rules = screen.getByLabelText("Reglas para palabras prohibidas");
    const theme = screen.getByLabelText("Temática a editar");
    expect(rules.tagName).toBe("TEXTAREA");
    expect(theme.tagName).toBe("TEXTAREA");
    expect(rules).toHaveAttribute("maxlength", "500");
    expect(rules).toHaveValue("Common associations.\nNo obscure terms.");
    fireEvent.change(rules, { target: { value: "  Familiar terms.\nAvoid jargon.  " } });
    fireEvent.change(theme, { target: { value: "  Food\nand drinks  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        "/api/admin/decks/deck-1",
        expect.objectContaining({
          body: JSON.stringify({
            name: "General",
            theme: "Food\nand drinks",
            rules: "Familiar terms.\nAvoid jargon.",
          }),
        }),
      ),
    );
    fireEvent.change(rules, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        "/api/admin/decks/deck-1",
        expect.objectContaining({
          body: JSON.stringify({ name: "General", theme: "Food\nand drinks", rules: "" }),
        }),
      ),
    );
  });

  it.each([{ busy: true }, { running: true }])(
    "locks the rules and theme textareas during operations (%j)",
    (lock) => {
      renderManagement(lock);
      expect(screen.getByLabelText("Reglas para palabras prohibidas")).toBeDisabled();
      expect(screen.getByLabelText("Temática a editar")).toBeDisabled();
    },
  );

  it("offers permanent deletion only when archived and requires confirmation", async () => {
    const { api, onDeleted } = renderManagement({ deck: archivedDeck });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    expect(screen.getByRole("dialog", { name: "Eliminar mazo definitivamente" })).toBeVisible();
    expect(screen.getByText(/Se eliminarán el mazo, sus cartas y su historial/)).toBeVisible();
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar eliminación" }));
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar eliminación definitiva" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/admin/decks/deck-1/permanent", { method: "DELETE" }),
    );
    expect(onDeleted).toHaveBeenCalledWith("deck-1");
  });

  it("does not offer permanent deletion on an active deck", () => {
    renderManagement();
    expect(
      screen.queryByRole("button", { name: "Eliminar definitivamente" }),
    ).not.toBeInTheDocument();
  });

  it.each([{ busy: true }, { running: true }])(
    "disables permanent deletion during another operation (%j)",
    (lock) => {
      renderManagement({ deck: archivedDeck, ...lock });
      expect(screen.getByRole("button", { name: "Eliminar definitivamente" })).toBeDisabled();
    },
  );
  it("loads an enabled option and can turn it off", async () => {
    const { api } = renderManagement({ deck: { ...deck, allowProperNames: true } });
    const checkbox = screen.getByRole("checkbox", { name: "Permitir nombres propios y títulos" });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/admin/decks/deck-1",
        expect.objectContaining({
          body: JSON.stringify({ name: "General", theme: "Objetos", allowProperNames: false }),
        }),
      ),
    );
  });
  it("edits the default-off proper-name option", async () => {
    const { api } = renderManagement();
    const checkbox = screen.getByRole("checkbox", { name: "Permitir nombres propios y títulos" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/admin/decks/deck-1",
        expect.objectContaining({
          body: JSON.stringify({ name: "General", theme: "Objetos", allowProperNames: true }),
        }),
      ),
    );
  });
  it("edits the name and the theme with the application limits", async () => {
    const { api } = renderManagement();

    const name = screen.getByLabelText("Nombre a editar");
    const theme = screen.getByLabelText("Temática a editar");
    expect(name).toHaveAttribute("maxlength", "80");
    expect(theme).toHaveAttribute("maxlength", "200");
    expect(name).toHaveValue("General");
    expect(theme).toHaveValue("Objetos");

    fireEvent.change(name, { target: { value: "  Nuevo  " } });
    fireEvent.change(theme, { target: { value: "  Tema nuevo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/admin/decks/deck-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nuevo", theme: "Tema nuevo" }),
      }),
    );
  });

  it("asks for a confirmation before archiving and can be cancelled", async () => {
    const { api } = renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "Archivar mazo" }));

    const dialog = screen.getByRole("dialog", { name: "Archivar mazo" });
    expect(within(dialog).getByText(/General/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirmar archivado" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    expect(api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("button", { name: "Confirmar archivado" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivar mazo" })).toBeVisible();
    expect(api).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "dismisses the confirmation with Escape without a request (archived=%s)",
    async (archived) => {
      const { api } = renderManagement({ deck: archived ? archivedDeck : deck });
      fireEvent.click(
        screen.getByRole("button", {
          name: archived ? "Eliminar definitivamente" : "Archivar mazo",
        }),
      );
      const dialog = screen.getByRole("dialog");
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(api).not.toHaveBeenCalled();
    },
  );

  it("archives the deck only after the confirmation", async () => {
    const { api, onArchived } = renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "Archivar mazo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar archivado" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/admin/decks/deck-1", { method: "DELETE" }),
    );
    expect(onArchived).toHaveBeenCalledWith("deck-1");
  });

  it.each([false, true])(
    "locks an already open confirmation when the panel becomes busy (archived=%s)",
    (archived) => {
      const selected = archived ? archivedDeck : deck;
      const { api, act, onArchived, onDeleted, rerender } = renderManagement({ deck: selected });
      fireEvent.click(
        screen.getByRole("button", {
          name: archived ? "Eliminar definitivamente" : "Archivar mazo",
        }),
      );
      rerender(
        <DeckManagement
          deck={selected}
          busy
          running={false}
          api={api as unknown as DeckManagementProps["api"]}
          act={act}
          onArchived={onArchived}
          onDeleted={onDeleted}
        />,
      );
      const confirm = screen.getByRole("button", {
        name: archived ? "Confirmar eliminación definitiva" : "Confirmar archivado",
      });
      expect(confirm).toBeDisabled();
      fireEvent.click(confirm);
      expect(api).not.toHaveBeenCalled();
    },
  );

  it("restores an archived deck without offering to archive it again", async () => {
    const { api } = renderManagement({ deck: archivedDeck });

    expect(screen.getByText("Archivado")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Archivar mazo" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restaurar mazo" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/admin/decks/deck-1/restore", { method: "POST" }),
    );
  });

  it("keeps the archive, restore and editor controls disabled while a job runs", () => {
    renderManagement({ running: true });

    expect(screen.getByRole("button", { name: "Archivar mazo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByLabelText("Nombre a editar")).toBeDisabled();
    expect(screen.getByLabelText("Temática a editar")).toBeDisabled();
  });

  it("keeps the archive and restore controls disabled while the panel is busy", () => {
    renderManagement({ busy: true });

    expect(screen.getByRole("button", { name: "Archivar mazo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("does not render anything when there is no selected deck", () => {
    renderManagement({ deck: null });

    expect(screen.queryByRole("button", { name: "Archivar mazo" })).not.toBeInTheDocument();
  });
});
