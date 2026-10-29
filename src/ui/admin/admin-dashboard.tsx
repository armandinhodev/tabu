"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import {
  createAdminSocket,
  type AdminConnectionState,
  type AdminSocketClient,
} from "@/ui/lib/admin-socket";

import { AdminLogin } from "./login/admin-login";

type CardView = {
  id: string;
  word: string;
  taboo: string[];
  excluded: boolean;
  manualOverride: boolean;
  issues: string[];
  candidates?: { word: string; recognized?: boolean; valid?: boolean; reason?: string }[];
};
type DeckView = { id: string; name: string; theme: string; cards: CardView[] };
type JobView = {
  id: string;
  deckId?: string;
  kind?: "generate" | "replace";
  status: "queued" | "running" | "completed" | "failed";
  requested?: number;
  processed?: number;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  updatedAt?: string;
};

class RequestFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const result = (await response.json()) as { data: T; error?: string };
  if (!response.ok)
    throw new RequestFailure(response.status, result.error ?? "No se pudo completar la solicitud.");
  return result.data;
}

function savedJob(): string | null {
  try {
    return sessionStorage.getItem("tabu:admin-job");
  } catch {
    return null;
  }
}

function rememberJob(id: string | null): void {
  try {
    if (id) sessionStorage.setItem("tabu:admin-job", id);
    else sessionStorage.removeItem("tabu:admin-job");
  } catch {
    /* A blocked storage must not disable administration. */
  }
}

const jobLabels = {
  queued: "En cola",
  running: "Generando",
  completed: "Completado",
  failed: "Fallido",
};

const connectionLabels: Record<AdminConnectionState, string> = {
  idle: "Sin conexión",
  connecting: "Conectando…",
  connected: "Conectada",
  reconnecting: "Reconectando…",
  closed: "Cerrada",
  unauthorized: "Sesión vencida",
};

export function AdminDashboard() {
  const [auth, setAuth] = useState<"loading" | "authorized" | "login">("loading");
  const [configured, setConfigured] = useState(false);
  const [decks, setDecks] = useState<DeckView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckView | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState("5");
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  const [connection, setConnection] = useState<AdminConnectionState>("idle");
  const socketRef = useRef<AdminSocketClient | null>(null);
  const progressRef = useRef("");
  const reconnectRef = useRef(false);
  const appliedRef = useRef<{ id: string; updatedAt: string } | null>(null);

  /**
   * Aplica el estado de un trabajo sin retroceder.
   *
   * La lectura HTTP inicial y las entregas del socket pasan por acá: si la
   * respuesta HTTP llega tarde con un estado viejo, no puede pisar el
   * progreso que ya llegó por el socket.
   */
  const applyJob = useCallback((next: JobView): boolean => {
    const applied = appliedRef.current;

    if (applied !== null && applied.id === next.id) {
      if (next.updatedAt === undefined) {
        // Sin marca de tiempo durable no se pisa un estado conocido.
        return false;
      }

      if (applied.updatedAt !== "" && next.updatedAt < applied.updatedAt) {
        return false;
      }
    }

    appliedRef.current = { id: next.id, updatedAt: next.updatedAt ?? "" };
    setJob(next);

    return true;
  }, []);

  const reportError = useCallback((failure: unknown) => {
    if (failure instanceof RequestFailure && failure.status === 401) {
      setAuth("login");
      setDeck(null);
      setDecks([]);
    }
    setError(
      failure instanceof RequestFailure ? failure.message : "No se pudo conectar con el servidor.",
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/auth", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        const session = (await response.json()) as { authenticated: boolean; configured: boolean };
        if (controller.signal.aborted) return;
        setConfigured(session.configured);
        setAuth(session.authenticated ? "authorized" : "login");
        if (session.authenticated) setJobId(savedJob());
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("No se pudo verificar la sesión. Actualiza la página para reintentar.");
          setAuth("login");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (auth !== "authorized") return;
    const controller = new AbortController();
    async function load() {
      try {
        const [catalog, detail] = await Promise.all([
          api<DeckView[]>("/api/admin/decks", { signal: controller.signal }),
          selectedId
            ? api<DeckView>(`/api/admin/decks/${encodeURIComponent(selectedId)}`, {
                signal: controller.signal,
              })
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        setDecks(catalog);
        if (!selectedId && catalog[0]) setSelectedId(catalog[0].id);
        setDeck(detail);
      } catch (failure) {
        if (!controller.signal.aborted) reportError(failure);
      }
    }
    void load();
    return () => controller.abort();
  }, [auth, selectedId, refresh, reportError]);

  /**
   * El trabajo se lee una sola vez por HTTP: el progreso vivo llega por el
   * socket de administración. No hay temporizadores de sondeo.
   */
  useEffect(() => {
    if (auth !== "authorized" || jobId === null) return;
    const controller = new AbortController();
    api<JobView>(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal })
      .then((progress) => {
        if (controller.signal.aborted) return;
        applyJob(progress);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof RequestFailure && failure.status === 404) {
          rememberJob(null);
          setJobId(null);
          setJob(null);
          appliedRef.current = null;
          return;
        }
        reportError(failure);
      });
    return () => controller.abort();
  }, [auth, jobId, applyJob, reportError]);

  /**
   * Canal de progreso en vivo (S9). El socket es propio del panel: el juego no
   * se ve afectado y se cierra al salir del panel o al cerrar sesión.
   */
  useEffect(() => {
    if (auth !== "authorized") return;

    const client = createAdminSocket({
      onJob: (update) => {
        if (!applyJob(update)) return;
        // El refresco se dispara sólo cuando el progreso avanza de verdad:
        // un evento repetido no genera una ráfaga de pedidos.
        const key = `${update.id}:${update.status}:${update.processed}`;
        if (key === progressRef.current) return;
        progressRef.current = key;
        setRefresh((value) => value + 1);
      },
      onState: (state) => {
        setConnection(state);
        if (state === "unauthorized") {
          socketRef.current?.disconnect();
          setJob(null);
          setDeck(null);
          setDecks([]);
          appliedRef.current = null;
          setAuth("login");
          return;
        }
        if (state === "reconnecting") {
          reconnectRef.current = true;
          return;
        }
        if (state === "connected" && reconnectRef.current) {
          // Tras reconectar el estado autoritativo viene del servidor.
          reconnectRef.current = false;
          setRefresh((value) => value + 1);
        }
      },
      onError: (message) => setError(message),
    });

    socketRef.current = client;

    return () => {
      socketRef.current = null;
      client.disconnect();
    };
  }, [applyJob, auth]);

  useEffect(() => {
    const client = socketRef.current;
    if (client === null || jobId === null) return;
    client.subscribe(jobId);
  }, [auth, jobId]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      reportError(failure);
    } finally {
      setBusy(false);
      setRefresh((value) => value + 1);
    }
  }

  function trackJob(next: JobView) {
    setJob(next);
    setJobId(next.id);
    rememberJob(next.id);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const amount = Number(count);
      if (!Number.isInteger(amount) || amount < 1 || amount > 50)
        throw new RequestFailure(400, "La cantidad debe ser un entero entre 1 y 50.");
      const created = await api<DeckView>("/api/admin/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), theme: theme.trim() }),
      });
      setSelectedId(created.id);
      setDeck(created);
      setName("");
      setTheme("");
      trackJob(
        await api<JobView>(`/api/admin/decks/${encodeURIComponent(created.id)}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: amount }),
        }),
      );
    });
  }

  const running = job?.status === "queued" || job?.status === "running";
  const cards = deck?.cards ?? [];
  const visibleCards = onlyExcluded ? cards.filter((card) => card.excluded) : cards;

  if (auth === "loading")
    return (
      <main className="mx-auto max-w-5xl p-6" aria-live="polite">
        Verificando sesión…
      </main>
    );
  if (auth === "login")
    return (
      <main className="mx-auto max-w-lg p-6">
        <Link href="/" className="text-fg-muted underline">
          Volver al juego
        </Link>
        <AdminLogin
          configured={configured}
          onAuthenticated={() => {
            setAuth("authorized");
            setError("");
            setJobId(savedJob());
          }}
        />
        {error && (
          <p role="alert" className="mt-4 text-warning">
            {error}
          </p>
        )}
      </main>
    );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-h2">Administración de mazos</h1>
          <p className="mt-1 text-fg-muted">
            Generación con DeepSeek Flash y revisión ortográfica local.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-fg-muted underline">
            Volver al juego
          </Link>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const response = await fetch("/api/admin/auth", {
                  method: "DELETE",
                  credentials: "same-origin",
                });
                if (!response.ok)
                  throw new RequestFailure(response.status, "No se pudo cerrar la sesión.");
                socketRef.current?.disconnect();
                rememberJob(null);
                setJobId(null);
                setJob(null);
                setDeck(null);
                setDecks([]);
                appliedRef.current = null;
                setAuth("login");
              })
            }
          >
            Cerrar sesión
          </Button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-warning bg-warning-soft p-4 text-warning"
        >
          {error}
        </p>
      )}

      <section
        className="rounded-lg border border-line bg-surface p-5"
        aria-labelledby="create-title"
      >
        <h2 id="create-title" className="font-display text-h3">
          Crear un mazo
        </h2>
        <form onSubmit={(event) => void create(event)} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span>Nombre del mazo</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label className="space-y-2">
            <span>Cantidad de cartas</span>
            <Input
              type="number"
              min={1}
              max={50}
              step={1}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span>Temática e indicaciones</span>
            <Input
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              maxLength={500}
              required
              disabled={busy}
              placeholder="Ejemplo: deportes para público general, sin nombres propios"
            />
          </label>
          <p className="text-body-sm text-fg-muted md:col-span-2">
            La generación consume la API configurada en el servidor. Se procesa en lotes de cinco;
            cada carta conserva hasta seis prohibidas de una sola palabra.
          </p>
          <Button type="submit" disabled={busy || running || !name.trim() || !theme.trim()}>
            {busy ? "Enviando…" : "Crear y generar"}
          </Button>
        </form>
      </section>

      {job && (
        <section
          aria-label="Progreso de generación"
          aria-live="polite"
          className="rounded-lg border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">
              {jobLabels[job.status]} · {job.processed ?? 0}/{job.requested ?? 0} cartas
            </p>
            <p className="text-body-sm text-fg-muted" role="status">
              Progreso en vivo: {connectionLabels[connection]}
            </p>
          </div>
          <progress
            className="mt-3 h-3 w-full"
            max={Math.max(job.requested ?? 1, 1)}
            value={job.processed ?? 0}
          />
          <p className="mt-2 text-body-sm text-fg-muted">
            Tokens de entrada: {job.inputTokens ?? 0} · salida: {job.outputTokens ?? 0}
          </p>
          {job.error && (
            <p role="alert" className="mt-2 text-warning">
              {job.error}
            </p>
          )}
        </section>
      )}

      {!job && connection === "reconnecting" && (
        <p
          role="status"
          className="rounded-md border border-line bg-surface p-4 text-body-sm text-fg-muted"
        >
          Se perdió la conexión con el progreso del servidor: se reconecta sola.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-3" aria-label="Mazos administrados">
          <h2 className="font-display text-h3">Mazos</h2>
          {decks.length === 0 && (
            <p className="text-fg-muted">
              Todavía no hay mazos creados desde este panel. Los mazos originales del juego no se
              modifican.
            </p>
          )}
          {decks.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedId === item.id}
              onClick={() => {
                setSelectedId(item.id);
                setDeck(null);
              }}
              className={`w-full rounded-md border p-4 text-left ${selectedId === item.id ? "border-accent bg-surface-2" : "border-line bg-surface"}`}
            >
              <span className="block font-semibold">{item.name}</span>
              <span className="mt-1 block text-body-sm text-fg-muted">
                {item.cards?.length ?? 0} cartas
              </span>
            </button>
          ))}
          <Button variant="quiet" size="sm" onClick={() => setRefresh((value) => value + 1)}>
            Actualizar
          </Button>
        </aside>

        <section className="min-w-0 space-y-4" aria-label="Cartas del mazo">
          {deck && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-h3">{deck.name}</h2>
                  <p className="text-fg-muted">{deck.theme}</p>
                  <p className="mt-1 text-body-sm">
                    {cards.filter((card) => !card.excluded).length} disponibles ·{" "}
                    {cards.filter((card) => card.excluded).length} excluidas
                  </p>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onlyExcluded}
                    onChange={(event) => setOnlyExcluded(event.target.checked)}
                  />
                  Solo excluidas
                </label>
              </div>
              <Button
                variant="ghost"
                disabled={busy || running}
                onClick={() =>
                  void act(async () => {
                    const amount = Number(count);
                    if (!Number.isInteger(amount) || amount < 1 || amount > 50)
                      throw new RequestFailure(400, "La cantidad debe ser un entero entre 1 y 50.");
                    trackJob(
                      await api<JobView>(
                        `/api/admin/decks/${encodeURIComponent(deck.id)}/generate`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ count: amount }),
                        },
                      ),
                    );
                  })
                }
              >
                Generar {count} cartas más
              </Button>
            </>
          )}
          {deck && visibleCards.length === 0 && (
            <p className="rounded-md border border-line p-5 text-fg-muted">
              No hay cartas para mostrar. El progreso se actualiza automáticamente durante la
              generación.
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleCards.map((card) => (
              <article key={card.id} className="rounded-lg border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-h3">{card.word}</h3>
                  <span className={card.excluded ? "text-warning" : "text-success"}>
                    {card.excluded
                      ? "Excluida"
                      : card.manualOverride
                        ? "Habilitada manualmente"
                        : "Disponible"}
                  </span>
                </div>
                <ol className="mt-4 grid grid-cols-2 gap-2">
                  {card.taboo.map((word, index) => (
                    <li key={`${index}-${word}`} className="rounded-md bg-surface-2 px-3 py-2">
                      {word}
                    </li>
                  ))}
                </ol>
                {card.taboo.length < 6 && (
                  <p className="mt-3 text-warning">Faltan prohibidas para completar las seis.</p>
                )}
                {card.issues.length > 0 && (
                  <details className="mt-4 text-body-sm">
                    <summary className="cursor-pointer text-warning">
                      Ver advertencias ({card.issues.length})
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {card.issues.map((issue, index) => (
                        <li key={`${index}-${issue}`}>{issue}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-fg-muted">
                      Una palabra desconocida puede ser un regionalismo. Habilitar la carta no
                      elimina estas advertencias.
                    </p>
                  </details>
                )}
                {card.candidates && card.candidates.length > 0 && (
                  <details className="mt-3 text-body-sm">
                    <summary className="cursor-pointer">Ver candidatas y validación</summary>
                    <ul className="mt-2 space-y-1">
                      {card.candidates.map((candidate, index) => (
                        <li key={`${index}-${candidate.word}`}>
                          {candidate.word} · {candidate.recognized ? "Reconocida" : "Revisar"}
                          {candidate.reason ? ` · ${candidate.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={card.excluded ? "caution" : "ghost"}
                    disabled={busy || running || (card.excluded && card.taboo.length !== 6)}
                    onClick={() =>
                      void act(async () => {
                        await api(
                          `/api/admin/decks/${encodeURIComponent(deck!.id)}/cards/${encodeURIComponent(card.id)}`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ excluded: !card.excluded }),
                          },
                        );
                      })
                    }
                  >
                    {card.excluded ? "Habilitar de todos modos" : "Excluir"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || running}
                    onClick={() =>
                      void act(async () =>
                        trackJob(
                          await api<JobView>(
                            `/api/admin/decks/${encodeURIComponent(deck!.id)}/cards/${encodeURIComponent(card.id)}/replace`,
                            { method: "POST" },
                          ),
                        ),
                      )
                    }
                  >
                    Reemplazar con Flash
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
