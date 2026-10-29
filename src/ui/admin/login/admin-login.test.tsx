import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** Promise whose settlement the test controls, to observe the pending state. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

function formElement(): HTMLFormElement {
  const form = document.querySelector("form");

  if (form === null) {
    throw new Error("The login form is not rendered.");
  }

  return form;
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
  it("places the return-to-game navigation inside the named login card", () => {
    render(<AdminLogin configured />);
    const card = screen.getByRole("region", { name: "Acceso al panel de administración" });
    expect(within(card).getByRole("link", { name: "Volver al juego" })).toHaveAttribute(
      "href",
      "/",
    );
  });

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

describe("AdminLogin presentation", () => {
  it("presents an accessible heading that names the administrative panel", () => {
    render(<AdminLogin configured />);

    expect(
      screen.getByRole("heading", { name: "Acceso al panel de administración" }),
    ).toBeInTheDocument();
  });

  it("toggles the password visibility with an accessible labelled button", () => {
    render(<AdminLogin configured />);

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");

    const show = screen.getByRole("button", { name: "Mostrar contraseña" });

    expect(show).toHaveAttribute("type", "button");
    expect(show).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(show);

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");

    const hide = screen.getByRole("button", { name: "Ocultar contraseña" });

    expect(hide).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(hide);

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("does not send any request when the visibility toggle is used", () => {
    render(<AdminLogin configured />);
    fillCredentials();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables every control and marks the form as busy while the request is in flight", async () => {
    const pending = deferred<Response>();

    fetchMock.mockReturnValue(pending.promise);

    render(<AdminLogin configured />);
    fillCredentials();

    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    const submit = await screen.findByRole("button", { name: "Ingresando…" });

    expect(submit).toBeDisabled();
    expect(formElement()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Usuario")).toBeDisabled();
    expect(screen.getByLabelText("Contraseña")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toBeDisabled();

    pending.resolve(Response.json({ authenticated: true }));

    await waitFor(() => expect(formElement()).toHaveAttribute("aria-busy", "false"));
  });

  it("never sends the credentials twice while a login is pending", async () => {
    const pending = deferred<Response>();
    const onAuthenticated = vi.fn();

    fetchMock.mockReturnValue(pending.promise);

    render(<AdminLogin configured onAuthenticated={onAuthenticated} />);
    fillCredentials();

    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ingresando…" }));
    fireEvent.submit(formElement());

    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending.resolve(Response.json({ authenticated: true }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the password but keeps the username after a rejected attempt", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 }),
    );

    render(<AdminLogin configured />);
    fillCredentials();

    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos."),
    );
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
    expect(screen.getByLabelText("Usuario")).toHaveValue("admin-decks");
  });

  it("associates the credential error with the password field", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 }),
    );

    render(<AdminLogin configured />);
    fillCredentials();

    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    const alert = await screen.findByRole("alert");
    const password = screen.getByLabelText("Contraseña");

    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", alert.getAttribute("id"));
    expect(alert.getAttribute("id")).toBeTruthy();
  });

  it("blocks the visibility toggle when the panel is not configured", () => {
    render(<AdminLogin configured={false} />);

    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "El panel de administración no está disponible",
    );
  });
});
