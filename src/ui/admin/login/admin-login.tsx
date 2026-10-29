"use client";

import { AlertTriangle, ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

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

const TITLE_ID = "admin-login-title";
const ERROR_ID = "admin-login-error";

type LoginErrorKind = "credentials" | "rate-limited" | "unavailable" | "server" | "network";

interface LoginError {
  readonly kind: LoginErrorKind;
  readonly message: string;
}

/**
 * Login of the administrative panel. The session lives in an http only cookie
 * set by the server: nothing is stored in the browser storage and no token is
 * handled here.
 */
export function AdminLogin({ configured, onAuthenticated }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [busy, setBusy] = useState(false);
  // Mirrors `busy` so a second submit cannot slip through before the next
  // render: the request is sent once per attempt.
  const pending = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!configured || pending.current) {
      return;
    }

    pending.current = true;
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
      setPasswordVisible(false);

      if (response.ok) {
        onAuthenticated?.();

        return;
      }

      if (response.status === 401) {
        setError({ kind: "credentials", message: INVALID_CREDENTIALS_MESSAGE });

        return;
      }

      if (response.status === 429) {
        setError({ kind: "rate-limited", message: RATE_LIMITED_MESSAGE });

        return;
      }

      if (response.status === 503) {
        setError({ kind: "unavailable", message: UNAVAILABLE_MESSAGE });

        return;
      }

      setError({ kind: "server", message: SERVER_ERROR_MESSAGE });
    } catch {
      setError({ kind: "network", message: NETWORK_ERROR_MESSAGE });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const disabled = !configured || busy;
  const complete = username.trim() !== "" && password !== "";
  // Only a rejected credential marks the field as invalid: a server or
  // network failure is not a validity problem of the typed value.
  const invalid = error?.kind === "credentials";

  return (
    <section
      aria-labelledby={TITLE_ID}
      className="flex w-full flex-col gap-5 rounded-xl border border-line bg-surface-2 p-5 shadow-card sm:p-6"
    >
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-md px-2 text-body-sm text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al juego
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-md bg-accent font-display text-h3 font-extrabold text-on-accent"
          >
            T
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-caption text-fg-subtle uppercase">Tabú · Administración</span>
            <h2 id={TITLE_ID} className="font-display text-h3 font-bold text-fg">
              Acceso al panel de administración
            </h2>
          </div>
        </div>
        <p className="text-body-sm text-fg-muted">
          Solo el administrador del servidor puede entrar a este panel y gestionar los mazos.
        </p>
      </header>

      <form className="flex flex-col gap-4" onSubmit={submit} aria-busy={busy}>
        {configured ? null : (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-md border border-line bg-surface-3 p-3 text-body-sm text-fg-muted"
          >
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {UNAVAILABLE_MESSAGE}
          </p>
        )}

        <Field label="Usuario" htmlFor="admin-username">
          <Input
            id="admin-username"
            name="username"
            type="text"
            value={username}
            maxLength={128}
            autoComplete="username"
            autoFocus
            disabled={disabled}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
        </Field>

        <Field label="Contraseña" htmlFor="admin-password">
          <div className="relative">
            <Input
              id="admin-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              value={password}
              maxLength={256}
              autoComplete="current-password"
              className="pr-14"
              disabled={disabled}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? ERROR_ID : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <Button
              variant="quiet"
              size="icon"
              className="absolute top-1/2 right-1 -translate-y-1/2 hover:bg-surface-3"
              aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={passwordVisible}
              disabled={disabled}
              onClick={() => {
                setPasswordVisible((visible) => !visible);
              }}
            >
              {passwordVisible ? (
                <EyeOff aria-hidden="true" className="size-5" />
              ) : (
                <Eye aria-hidden="true" className="size-5" />
              )}
            </Button>
          </div>
        </Field>

        {error !== null ? (
          <p
            id={ERROR_ID}
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-warning bg-warning-soft p-3 text-body-sm text-warning"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error.message}
          </p>
        ) : null}

        <Button type="submit" block disabled={disabled || !complete}>
          {busy ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>

      <p className="flex items-start gap-2 text-body-sm text-fg-subtle">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        La sesión viaja en una cookie segura del servidor. Lo que escribas aquí no queda guardado en
        este navegador.
      </p>
    </section>
  );
}
