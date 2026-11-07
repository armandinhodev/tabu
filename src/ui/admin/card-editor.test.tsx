import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

import { CardEditor } from "./card-editor";

const card = {
  id: "card-1",
  word: "fuego",
  taboo: ["calor", "humo"],
  excluded: true,
  manualOverride: false,
  issues: [],
};

const other = {
  id: "card-2",
  word: "agua",
  taboo: ["rio", "mar"],
  excluded: false,
  manualOverride: false,
  issues: [],
};

afterEach(cleanup);

describe("CardEditor", () => {
  it("refuses a stale draft after the visible card content changes", () => {
    const onSave = vi.fn(async () => true);
    const view = render(
      <CardEditor card={card} cards={[card, other]} disabled={false} onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    view.rerender(
      <CardEditor
        card={{ ...card, word: "agua" }}
        cards={[card, other]}
        disabled={false}
        onSave={onSave}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("La carta cambió durante la edición");
    expect(screen.getByRole("button", { name: "Guardar carta" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar carta" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("lets an administrator edit the objective and six forbidden fields without saving on cancel", async () => {
    const onSave = vi.fn(async () => true);
    render(<CardEditor card={card} cards={[card, other]} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    expect(screen.getByLabelText("Palabra objetivo")).toHaveValue("fuego");
    expect(screen.getAllByRole("textbox")).toHaveLength(7);
    fireEvent.change(screen.getByLabelText("Palabra objetivo"), { target: { value: "llama" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    expect(screen.getByLabelText("Palabra objetivo")).toHaveValue("fuego");
    fireEvent.change(screen.getByLabelText("Palabra objetivo"), { target: { value: " llama " } });
    fireEvent.change(screen.getByLabelText("Palabra prohibida 1"), { target: { value: " rio " } });
    fireEvent.change(screen.getByLabelText("Palabra prohibida 2"), { target: { value: "mar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar carta" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ word: "llama", taboo: ["rio", "mar"] }),
    );
    expect(screen.queryByRole("button", { name: "Guardar carta" })).not.toBeInTheDocument();
  });

  it("keeps failed edits open and retains the entered values", async () => {
    render(
      <CardEditor card={card} cards={[card, other]} disabled={false} onSave={async () => false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    fireEvent.change(screen.getByLabelText("Palabra objetivo"), { target: { value: "llama" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar carta" }));
    await waitFor(() => expect(screen.getByLabelText("Palabra objetivo")).toHaveValue("llama"));
    expect(screen.getByRole("button", { name: "Guardar carta" })).toBeEnabled();
  });

  it("avisa que el objetivo ya lo usa otra carta antes de guardar", () => {
    const onSave = vi.fn(async () => true);
    render(<CardEditor card={card} cards={[card, other]} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    fireEvent.change(screen.getByLabelText("Palabra objetivo"), { target: { value: "AGUA" } });

    expect(screen.getByRole("alert")).toHaveTextContent("«AGUA» ya lo usa la carta «agua»");
    expect(screen.getByRole("button", { name: "Guardar carta" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar carta" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("permite corregir la ortografía de la propia carta sin tomarlo por conflicto", () => {
    const onSave = vi.fn(async () => true);
    render(<CardEditor card={card} cards={[card, other]} disabled={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    fireEvent.change(screen.getByLabelText("Palabra objetivo"), { target: { value: "FUEGO" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar carta" })).toBeEnabled();
  });

  it("disables both opening and saving while locked", () => {
    const onSave = vi.fn(async () => true);
    const view = render(
      <CardEditor card={card} cards={[card, other]} disabled={false} onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    view.rerender(<CardEditor card={card} cards={[card, other]} disabled={true} onSave={onSave} />);
    expect(screen.getByLabelText("Palabra objetivo")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar carta" })).toBeDisabled();
  });
});
