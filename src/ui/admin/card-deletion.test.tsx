import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});
import { CardDeletion } from "./card-deletion";
afterEach(cleanup);

describe("CardDeletion", () => {
  it("requires irreversible confirmation and makes no request on cancel or Escape", async () => {
    const onDelete = vi.fn(async () => {});
    render(<CardDeletion word="fuego" disabled={false} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar carta" }));
    expect(screen.getByRole("dialog", { name: "¿Eliminar esta carta?" })).toHaveTextContent(
      "fuego",
    );
    expect(screen.getByText(/no se puede deshacer/i)).toBeVisible();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar carta" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar carta" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar carta" }),
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
  it("locks an open confirmation when generation or another operation starts", () => {
    const onDelete = vi.fn(async () => {});
    const view = render(<CardDeletion word="fuego" disabled={false} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar carta" }));
    view.rerender(<CardDeletion word="fuego" disabled={true} onDelete={onDelete} />);
    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Eliminar carta",
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
