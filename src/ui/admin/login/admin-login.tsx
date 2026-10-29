"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/ui/components/ui/button";
import { Field } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";

export interface AdminLoginProps {
  /** Tells whether the server has the administrative credentials configured. */
  readonly configured: boolean;
  /** Called once the server accepted the credentials. */
  readonly onAuthenticated?: () => void;
}

const UNAVAILABLE_MESSAGE = "El panel de administración no está disponible en este servidor.";
const INVALID_CREDENTIALS_MESSAGE = "Usuario o contraseña incorrectos.";
const RATE_LIMITED_MESSAGE = "Demasiados intentos de acceso. Espera un momento e intenta de nuevo.";
const SERVER_ERROR_MESSAGE = "No pudimos iniciar sesión. Intenta de nuevo.";
const NETWORK_ERROR_MESSAGE = "No pudimos iniciar sesión. Revisa la conexión e intenta de nuevo.";

/**
 * Login of the administrative panel. The session lives in an http only cookie
 * set by the server: nothing is stored in the browser storage and no token is
 * handled here.
 */
export function AdminLogin({ configured, onAuthenticated }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!configured || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      setPassword("");

      if (response.ok) {
        onAuthenticated?.();

        return;
      }

      if (response.status === 401) {
        setError(INVALID_CREDENTIALS_MESSAGE);

        return;
      }

      if (response.status === 429) {
        setError(RATE_LIMITED_MESSAGE);

        return;
      }

      if (response.status === 503) {
        setError(UNAVAILABLE_MESSAGE);

        return;
      }

      setError(SERVER_ERROR_MESSAGE);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const disabled = !configured || busy;
  const complete = username.trim() !== "" && password !== "";

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} aria-busy={busy}>
      <Field label="Usuario" htmlFor="admin-username">
        <Input
          id="admin-username"
          name="username"
          type="text"
          value={username}
          maxLength={128}
          autoComplete="username"
          disabled={disabled}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </Field>

      <Field label="Contraseña" htmlFor="admin-password">
        <Input
          id="admin-password"
          name="password"
          type="password"
          value={password}
          maxLength={256}
          autoComplete="current-password"
          disabled={disabled}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </Field>

      {configured ? null : <p className="text-body-sm text-fg-subtle">{UNAVAILABLE_MESSAGE}</p>}

      {error !== null ? (
        <p role="alert" className="text-body-sm text-warning">
          {error}
        </p>
      ) : null}

      <Button type="submit" block disabled={disabled || !complete}>
        {busy ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
