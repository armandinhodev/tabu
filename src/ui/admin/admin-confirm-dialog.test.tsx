import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

import { AdminConfirmDialog } from "./admin-confirm-dialog";

afterEach(cleanup);

function Harness({
  onConfirm,
  disabled = false,
  intent = "delete",
}: {
  onConfirm: () => void;
  disabled?: boolean;
  intent?: "delete" | "archive";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir confirmación</button>
      <AdminConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={intent === "delete" ? "Eliminar carta" : "Archivar mazo"}
        description="La acción afecta a «fuego»."
        confirmLabel="Confirmar acción"
        targetName="fuego"
        targetLabel={intent === "delete" ? "Carta" : "Mazo"}
        disabled={disabled}
        intent={intent}
        onConfirm={onConfirm}
      />
    </>
  );
}

describe("AdminConfirmDialog", () => {
  it("explains irreversible intent and initially focuses cancellation before confirmation", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir confirmación" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar carta" });
    expect(dialog).toHaveAccessibleDescription("La acción afecta a «fuego».");
    expect(screen.getByText("fuego")).toBeVisible();
    expect(screen.getByText("Carta")).toBeVisible();
    expect(screen.queryByText("Acción irreversible")).not.toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Confirmar acción" });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each(["cancel", "close", "escape"])(
    "closes safely through %s and returns focus without confirming",
    async (action) => {
      const onConfirm = vi.fn();
      render(<Harness onConfirm={onConfirm} />);
      const opener = screen.getByRole("button", { name: "Abrir confirmación" });
      opener.focus();
      fireEvent.click(opener);
      await screen.findByRole("dialog");
      if (action === "escape")
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
      else
        fireEvent.click(
          screen.getByRole("button", {
            name: action === "close" ? "Cerrar confirmación" : "Cancelar",
          }),
        );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it("distinguishes recoverable archive and keeps confirmation disabled while busy", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} intent="archive" disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir confirmación" }));
    expect(screen.getByRole("dialog", { name: "Archivar mazo" })).toBeVisible();
    expect(screen.getByText("Mazo")).toBeVisible();
    expect(screen.getByText("fuego")).toBeVisible();
    expect(screen.queryByText("Acción irreversible")).not.toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirmar acción" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });
});
