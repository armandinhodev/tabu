import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminLogin } from "./admin-login";

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const react = createRequire(import.meta.url)("react") as typeof import("react");
  return { ...react, default: react };
});

const fetchMock = vi.fn();

function fillCredentials(): void {
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "admin-decks" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-de-prueba" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminLogin", () => {
  it("sends the credentials to the session endpoint and reports the success", async () => {
    fetchMock.mockResolvedValue(Response.json({ authenticated: true }));
    const onAuthenticated = vi.fn();

    render(<AdminLogin configured onAuthenticated={onAuthenticated} />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/auth",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ username: "admin-decks", password: "clave-de-prueba" }),
      }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("shows an error for wrong credentials and keeps the administrator signed out", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 }),
    );
    const onAuthenticated = vi.fn();

    render(<AdminLogin configured onAuthenticated={onAuthenticated} />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos."),
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    expect(document.querySelector("form")).toHaveAttribute("aria-busy", "false");
  });

  it("shows an error when the panel is not available on the server", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "no disponible" }, { status: 503 }));
    const onAuthenticated = vi.fn();

    render(<AdminLogin configured onAuthenticated={onAuthenticated} />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "El panel de administración no está disponible",
      ),
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("shows an error when the request cannot reach the server", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));
    const onAuthenticated = vi.fn();

    render(<AdminLogin configured onAuthenticated={onAuthenticated} />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No pudimos iniciar sesión"),
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("disables the form when the panel is not configured", () => {
    render(<AdminLogin configured={false} />);

    expect(screen.getByText(/El panel de administración no está disponible/)).toBeInTheDocument();
    expect(screen.getByLabelText("Usuario")).toBeDisabled();
    expect(screen.getByLabelText("Contraseña")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
  });

  it("keeps the submit disabled until both credentials are present", () => {
    render(<AdminLogin configured />);

    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "admin-decks" } });
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-de-prueba" } });
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
  });
});
