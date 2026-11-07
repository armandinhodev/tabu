import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** La fila de estados de la tabla de prohibidas: una celda por palabra. */
function stateCells(): HTMLElement[] {
  const table = screen.getByRole("table", { name: "Palabras prohibidas de la carta" });
  const rows = within(table).getAllByRole("row");
  const states = rows.at(-1);
  if (states === undefined) throw new Error("the table has no state row");
  return within(states).getAllByRole("cell");
}

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

  it("lays the six forbidden words out as one horizontal table", () => {
    render(
      <CardEditor card={card} cards={[card, other]} disabled={false} onSave={async () => true} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));

    const table = screen.getByRole("table", { name: "Palabras prohibidas de la carta" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(within(table).getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByLabelText("Palabra prohibida 1")).toHaveValue("calor");
    expect(screen.getByLabelText("Palabra prohibida 3")).toHaveValue("");
  });

  it("says per word whether the dictionary knows it", () => {
    const evaluated = {
      ...card,
      candidates: [
        { word: "calor", recognized: true, valid: true },
        { word: "humo", recognized: false, valid: false, reason: "not_in_dictionary" },
      ],
    };
    render(
      <CardEditor
        card={evaluated}
        cards={[evaluated, other]}
        disabled={false}
        onSave={async () => true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));

    const states = stateCells();
    expect(states[0]).toHaveTextContent("en el diccionario");
    expect(states[1]).toHaveTextContent("no reconocida");
    // Las cuatro que faltan están vacías: se dice, no se evalúa de mentira.
    expect(states.slice(2)).toHaveLength(4);
    for (const cell of states.slice(2)) expect(cell).toHaveTextContent("vacía");
  });

  it("does not invent a dictionary verdict for a word that was just typed", () => {
    const evaluated = {
      ...card,
      candidates: [{ word: "calor", recognized: true, valid: true }],
    };
    render(
      <CardEditor
        card={evaluated}
        cards={[evaluated, other]}
        disabled={false}
        onSave={async () => true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar carta" }));
    fireEvent.change(screen.getByLabelText("Palabra prohibida 1"), {
      target: { value: "hoguera" },
    });

    expect(stateCells()[0]).toHaveTextContent("sin evaluar");
    expect(stateCells()[0]).not.toHaveTextContent("en el diccionario");
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
