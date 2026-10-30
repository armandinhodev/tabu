"use client";

import Link from "next/link";
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListFilter,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { MAX_GENERATION_COUNT } from "@/application/admin/generation-limits";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Textarea } from "@/ui/components/ui/textarea";
import { MAX_DECK_RULES_LENGTH } from "@/application/admin/deck-limits";
import { Spinner } from "@/ui/components/ui/spinner";
import {
  createAdminSocket,
  type AdminConnectionState,
  type AdminSocketClient,
} from "@/ui/lib/admin-socket";

import { AdminLogin } from "./login/admin-login";
import { DeckManagement, type AdminDeckView } from "./deck-management";
import { ModelSettings } from "./model-settings";
import { CardEditor } from "./card-editor";
import { CardDeletion } from "./card-deletion";
import { normalizeWord } from "@/domain/value-objects/TabooWords";

const ADMIN_TABS = [
  ["create", "Crear mazo"],
  ["decks", "Mazos"],
  ["settings", "Configuración"],
] as const;
type AdminTab = (typeof ADMIN_TABS)[number][0];

const DECK_TABS = [
  ["cards", "Cartas"],
  ["settings", "Ajustes"],
] as const;
type DeckTab = (typeof DECK_TABS)[number][0];

type DeckView = AdminDeckView;
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
  // Show pending feedback before the server has returned a generation job.
  const [creating, setCreating] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [rules, setRules] = useState("");
  const [allowProperNames, setAllowProperNames] = useState(false);
  const [count, setCount] = useState("5");
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [cardsPage, setCardsPage] = useState(1);
  useEffect(() => setCardsPage(1), [selectedId, onlyExcluded, cardSearch]);
  const [activeTab, setActiveTab] = useState<AdminTab>("decks");
  const [deckTab, setDeckTab] = useState<DeckTab>("cards");
  const [showGeneration, setShowGeneration] = useState(false);
  const deckTabRefs = useRef<Partial<Record<DeckTab, HTMLButtonElement | null>>>({});
  useEffect(() => {
    setDeckTab("cards");
    setShowGeneration(false);
    setCardSearch("");
  }, [selectedId]);
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const tabRefs = useRef<Partial<Record<AdminTab, HTMLButtonElement | null>>>({});
  const [connection, setConnection] = useState<AdminConnectionState>("idle");
  const socketRef = useRef<AdminSocketClient | null>(null);
  const progressRef = useRef("");
  const reconnectRef = useRef(false);
  const appliedRef = useRef<{ id: string; updatedAt: string } | null>(null);
  /**
   * El catálogo elige un mazo solo cuando todavía no hubo una selección. Si el
   * administrador archiva el mazo seleccionado, la selección se limpia y no
   * vuelve a caer sola.
   */
  const selectionClearedRef = useRef(false);

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
    setCatalogLoading(true);
    async function load() {
      try {
        // Los mazos archivados se piden sólo cuando el filtro está activo:
        // el catálogo por defecto no cambia.
        const catalogUrl = showArchived
          ? "/api/admin/decks?includeArchived=true"
          : "/api/admin/decks";
        const [catalog, detail] = await Promise.all([
          api<DeckView[]>(catalogUrl, { signal: controller.signal }),
          selectedId
            ? api<DeckView>(`/api/admin/decks/${encodeURIComponent(selectedId)}`, {
                signal: controller.signal,
              })
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        setDecks(catalog);
        if (selectedId === null && !selectionClearedRef.current) {
          if (catalog[0]) setSelectedId(catalog[0].id);
        }
        setDeck(detail);
      } catch (failure) {
        if (!controller.signal.aborted) reportError(failure);
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [auth, selectedId, refresh, reportError, showArchived]);

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
    setDismissedJobId(null);
    setJob(next);
    setJobId(next.id);
    rememberJob(next.id);
  }

  function selectTab(next: AdminTab) {
    if (next !== activeTab && (job?.status === "completed" || job?.status === "failed")) {
      setDismissedJobId(job.id);
    }
    setActiveTab(next);
  }

  function selectDeckTab(next: DeckTab) {
    if (next !== deckTab && (job?.status === "completed" || job?.status === "failed")) {
      setDismissedJobId(job.id);
    }
    setDeckTab(next);
  }

  async function requestGeneration(amount: number, request: () => Promise<JobView>) {
    setCreating(amount);
    try {
      trackJob(await request());
    } finally {
      setCreating(null);
    }
  }

  /**
   * El mazo recién archivado sale del catálogo cuando el filtro está apagado:
   * la selección se limpia y el panel no queda apuntando a un mazo invisible.
   */
  function handleArchived(deckId: string) {
    if (showArchived) {
      return;
    }

    if (selectedId === deckId) {
      selectionClearedRef.current = true;
      setSelectedId(null);
      setDeck(null);
    }
  }

  function handleDeleted(deckId: string) {
    if (selectedId === deckId) {
      selectionClearedRef.current = true;
      setSelectedId(null);
      setDeck(null);
    }
    if (job?.deckId === deckId) {
      setJob(null);
      setJobId(null);
      rememberJob(null);
    }
  }

  /** El filtro de archivados recarga el catálogo y ajusta la selección. */
  function toggleArchived(next: boolean) {
    setShowArchived(next);

    if (!next && deck?.archivedAt !== undefined) {
      selectionClearedRef.current = true;
      setSelectedId(null);
      setDeck(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const amount = Number(count);
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GENERATION_COUNT)
        throw new RequestFailure(
          400,
          `La cantidad debe ser un entero entre 1 y ${MAX_GENERATION_COUNT}.`,
        );

      // El panel de progreso aparece con el primer clic: el usuario ve que el
      // mazo se está creando y que la generación se está encolando.
      setCreating(amount);

      try {
        const created = await api<DeckView>("/api/admin/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            theme: theme.trim(),
            ...(rules.trim() ? { rules: rules.trim() } : {}),
            ...(allowProperNames ? { allowProperNames: true } : {}),
          }),
        });
        setSelectedId(created.id);
        setDeck(created);
        selectTab("decks");
        setName("");
        setTheme("");
        setRules("");
        setAllowProperNames(false);
        trackJob(
          await api<JobView>(`/api/admin/decks/${encodeURIComponent(created.id)}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ count: amount }),
          }),
        );
      } finally {
        setCreating(null);
      }
    });
  }

  const running = job?.status === "queued" || job?.status === "running";
  const cards = deck?.cards ?? [];
  const searchQuery = normalizeWord(cardSearch);
  const filteredCards = cards.filter(
    (card) =>
      (!onlyExcluded || card.excluded) &&
      (!searchQuery ||
        [card.word, ...card.taboo].some((term) => normalizeWord(term).includes(searchQuery))),
  );
  const cardsPerPage = 20;
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / cardsPerPage));
  const currentPage = Math.min(cardsPage, totalPages);
  const pageStart = (currentPage - 1) * cardsPerPage;
  const visibleCards = filteredCards.slice(pageStart, pageStart + cardsPerPage);
  const archived = deck?.archivedAt !== undefined;

  if (auth === "loading")
    return (
      <main className="mx-auto max-w-5xl p-6" aria-live="polite">
        <Spinner label="Verificando sesión…" />
      </main>
    );
  if (auth === "login")
    return (
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-12">
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

      <div
        role="tablist"
        aria-label="Secciones del panel"
        className="flex flex-wrap gap-2 border-b border-line pb-2"
      >
        {ADMIN_TABS.map(([value, label]) => (
          <button
            key={value}
            ref={(element) => {
              tabRefs.current[value] = element;
            }}
            type="button"
            role="tab"
            id={`admin-${value}-tab`}
            aria-controls={`admin-${value}-panel`}
            aria-selected={activeTab === value}
            tabIndex={activeTab === value ? 0 : -1}
            className={`min-h-11 rounded-md px-4 font-display font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${activeTab === value ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
            onClick={() => selectTab(value)}
            onKeyDown={(event) => {
              const index = ADMIN_TABS.findIndex(([tab]) => tab === value);
              let nextIndex: number;
              if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = ADMIN_TABS.length - 1;
              else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
                nextIndex =
                  (index + (event.key === "ArrowRight" ? 1 : -1) + ADMIN_TABS.length) %
                  ADMIN_TABS.length;
              else return;
              const next = ADMIN_TABS[nextIndex]![0];
              event.preventDefault();
              selectTab(next);
              tabRefs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        id="admin-settings-panel"
        hidden={activeTab !== "settings"}
        tabIndex={0}
        className="rounded-lg border border-line bg-surface p-5"
        aria-labelledby="admin-settings-tab"
      >
        {activeTab === "settings" && <ModelSettings api={api} onError={reportError} />}
      </section>

      <section
        role="tabpanel"
        id="admin-create-panel"
        hidden={activeTab !== "create"}
        tabIndex={0}
        className="rounded-lg border border-line bg-surface p-5"
        aria-labelledby="admin-create-tab"
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
          <div className="space-y-2">
            <label htmlFor="create-card-count" className="block">
              Cantidad de cartas
            </label>
            <Input
              id="create-card-count"
              aria-describedby="create-generation-limit"
              type="number"
              min={1}
              max={MAX_GENERATION_COUNT}
              step={1}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              required
              disabled={busy}
            />
            <span id="create-generation-limit" className="block text-body-sm text-fg-muted">
              Máximo {MAX_GENERATION_COUNT} cartas por generación.
            </span>
          </div>
          <label className="space-y-2 md:col-span-2">
            <span>Temática e indicaciones</span>
            <Textarea
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              maxLength={500}
              required
              disabled={busy}
              placeholder="Ejemplo: deportes para público general"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span>Reglas para buscar palabras prohibidas</span>
            <Textarea
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              maxLength={MAX_DECK_RULES_LENGTH}
              disabled={busy}
              aria-describedby="forbidden-rules-hint"
              placeholder="Ejemplo: priorizar asociaciones comunes y evitar términos técnicos."
            />
          </label>
          <p id="forbidden-rules-hint" className="text-body-sm text-fg-muted md:col-span-2">
            Opcional. Hasta {MAX_DECK_RULES_LENGTH} caracteres. Estas reglas se aplican a las
            palabras prohibidas, no a la selección de objetivos.
          </p>
          <label className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={allowProperNames}
              onChange={(event) => setAllowProperNames(event.target.checked)}
              disabled={busy}
              aria-describedby="proper-names-help"
            />
            <span>Permitir nombres propios y títulos</span>
          </label>
          <details className="rounded-md border border-line px-4 text-body-sm md:col-span-2">
            <summary className="min-h-11 cursor-pointer py-3 text-fg-muted">
              ¿Qué permite esta opción?
            </summary>
            <div id="proper-names-help" className="space-y-2 pb-4 text-fg-muted">
              <p>
                Permite que los objetivos y las palabras prohibidas incluyan nombres propios y
                títulos de varias palabras, como «Juego de tronos» o «Ned Stark».
              </p>
              <p>
                Los nombres y títulos no se verifican en el diccionario: su ortografía debe
                revisarse manualmente. Sin esta opción, las prohibidas deben tener una sola palabra
                y se verifican en el diccionario.
              </p>
            </div>
          </details>
          <Button type="submit" disabled={busy || running || !name.trim() || !theme.trim()}>
            {busy ? "Enviando…" : "Crear y generar"}
          </Button>
        </form>
      </section>

      {(creating !== null ||
        running ||
        (job?.status === "failed" && job.id !== dismissedJobId)) && (
        <section
          aria-label="Progreso de generación"
          aria-live="polite"
          className="rounded-lg border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">
              {creating !== null || job === null
                ? `Preparando la generación · 0/${creating ?? 0} cartas`
                : `${jobLabels[job.status]} · ${job.processed ?? 0}/${job.requested ?? 0} cartas`}
            </p>
            {(creating !== null || running) && (
              <Spinner
                label={
                  creating !== null
                    ? "Preparando solicitud a DeepSeek…"
                    : job?.status === "queued"
                      ? "Solicitud en cola para DeepSeek…"
                      : (job?.processed ?? 0) === 0
                        ? "Esperando las primeras cartas de DeepSeek…"
                        : "Generando nuevas cartas con DeepSeek…"
                }
              />
            )}
            {creating === null &&
              job !== null &&
              // La leyenda sólo aparece cuando el canal de progreso se degrada:
              // mostrar "Conectada" todo el tiempo era ruido.
              (connection === "reconnecting" ||
                connection === "closed" ||
                connection === "unauthorized") && (
                <p className="text-body-sm text-warning" role="status">
                  Progreso en vivo: {connectionLabels[connection]}
                </p>
              )}
          </div>
          {creating !== null ? (
            <progress className="mt-3 h-3 w-full" aria-label="Preparando la generación" />
          ) : running ? (
            <progress
              className="mt-3 h-3 w-full"
              aria-label="Generación de cartas"
              max={Math.max(job?.requested ?? 1, 1)}
              value={job?.processed ?? 0}
            />
          ) : null}
          {creating === null && job !== null && (
            <p className="mt-2 text-body-sm text-fg-muted">
              Tokens de entrada: {job.inputTokens ?? 0} · salida: {job.outputTokens ?? 0}
            </p>
          )}
          {creating === null && job?.error && (
            <p role="alert" className="mt-2 text-warning">
              {job.error}
            </p>
          )}
        </section>
      )}

      {creating === null && job?.status === "completed" && job.id !== dismissedJobId && (
        <p role="status" className="flex items-center gap-2 text-body-sm text-success">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          Generación completada · {job.processed ?? 0}/{job.requested ?? 0} cartas
        </p>
      )}

      {!job && connection === "reconnecting" && (
        <p
          role="status"
          className="rounded-md border border-line bg-surface p-4 text-body-sm text-fg-muted"
        >
          Se perdió la conexión con el progreso del servidor: se reconecta sola.
        </p>
      )}

      <section
        role="tabpanel"
        id="admin-decks-panel"
        aria-labelledby="admin-decks-tab"
        hidden={activeTab !== "decks"}
        tabIndex={0}
        className="rounded-lg border border-line bg-surface p-4 md:p-6"
      >
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <aside
            className="min-w-0 space-y-3 rounded-lg border border-line bg-surface-2 p-4"
            aria-label="Mazos administrados"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-h3">
                <Layers aria-hidden="true" className="size-5 text-accent" />
                Mazos
              </h2>
              <span
                className="rounded-pill bg-surface px-3 py-1 text-body-sm text-fg-muted"
                aria-label={`${decks.length} mazos en el catálogo`}
              >
                {decks.length}
              </span>
            </div>
            <p className="text-body-sm text-fg-muted">
              Selecciona un mazo para revisar sus cartas y administrarlo.
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-accent"
                checked={showArchived}
                onChange={(event) => toggleArchived(event.target.checked)}
              />
              Mostrar archivados
            </label>
            {catalogLoading && decks.length === 0 && <Spinner label="Cargando mazos…" />}
            {!catalogLoading && decks.length === 0 && (
              <div className="space-y-3 rounded-md border border-dashed border-line p-4">
                <h3 className="font-semibold">
                  {showArchived ? "No hay mazos en el catálogo" : "Tu catálogo empieza aquí"}
                </h3>
                <p className="text-body-sm text-fg-muted">
                  {showArchived
                    ? "Crea un mazo para empezar a generar cartas."
                    : "Crea un mazo o activa Mostrar archivados para recuperar uno. Los mazos originales del juego no se modifican."}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    selectTab("create");
                    tabRefs.current.create?.focus();
                  }}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Crear mi primer mazo
                </Button>
              </div>
            )}
            {decks.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={selectedId === item.id ? "true" : undefined}
                onClick={() => {
                  selectionClearedRef.current = false;

                  if (item.id === selectedId) {
                    // Mismo mazo: la selección no cambia, así que el efecto no
                    // vuelve a pedir el detalle. Se relee para no dejar el
                    // panel en blanco hasta que alguien toque Actualizar.
                    setRefresh((value) => value + 1);
                    return;
                  }

                  setSelectedId(item.id);
                  setDeck(null);
                }}
                className={`w-full rounded-md border-2 p-4 text-left break-words transition-colors ${selectedId === item.id ? "border-accent bg-surface" : "border-transparent bg-surface hover:border-line-control"}`}
              >
                <span className="block font-semibold">{item.name}</span>
                <span className="mt-1 block text-body-sm text-fg-muted">
                  {item.cards?.length ?? 0} cartas
                </span>
                {selectedId === item.id && (
                  <span className="mt-2 flex items-center gap-1 text-body-sm text-accent">
                    <Check aria-hidden="true" className="size-4" />
                    Seleccionado
                  </span>
                )}
                {item.archivedAt !== undefined && (
                  <span className="mt-2 flex items-center gap-1 text-body-sm text-warning">
                    <Archive aria-hidden="true" className="size-4" />
                    Archivado
                  </span>
                )}
              </button>
            ))}
            <Button variant="quiet" size="sm" onClick={() => setRefresh((value) => value + 1)}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Actualizar
            </Button>
          </aside>

          <section className="min-w-0 space-y-4" aria-label="Cartas del mazo">
            {deck === null && catalogLoading && <Spinner label="Cargando cartas…" />}
            {deck === null && !catalogLoading && (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line p-6 text-center">
                <Layers aria-hidden="true" className="size-8 text-fg-muted" />
                <h2 className="font-display text-h3">Selecciona un mazo</h2>
                <p className="max-w-sm text-body-sm text-fg-muted">
                  Aquí aparecerán sus cartas, ajustes y opciones de generación.
                </p>
              </div>
            )}
            {deck && (
              <>
                <div className="rounded-lg border border-line bg-surface-2 p-5">
                  <div className="min-w-0 break-words">
                    <h2 className="font-display text-h3">{deck.name}</h2>
                    <p className="line-clamp-2 whitespace-pre-line text-fg-muted">{deck.theme}</p>
                    <p className="mt-3 text-body-sm text-fg-muted">
                      {cards.filter((card) => !card.excluded).length} disponibles ·{" "}
                      {cards.filter((card) => card.excluded).length} excluidas
                    </p>
                  </div>
                </div>
                <div
                  role="tablist"
                  aria-label="Secciones del mazo"
                  className="flex gap-2 border-b border-line pb-2"
                >
                  {DECK_TABS.map(([value, label], index) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      id={`deck-${value}-tab`}
                      aria-controls={`deck-${value}-panel`}
                      aria-selected={deckTab === value}
                      tabIndex={deckTab === value ? 0 : -1}
                      ref={(element) => {
                        deckTabRefs.current[value] = element;
                      }}
                      className={`min-h-11 rounded-md px-4 font-display font-semibold ${deckTab === value ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
                      onClick={() => selectDeckTab(value)}
                      onKeyDown={(event) => {
                        let next: DeckTab;
                        if (event.key === "Home") next = "cards";
                        else if (event.key === "End") next = "settings";
                        else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
                          next = DECK_TABS[(index + 1) % DECK_TABS.length]![0];
                        else return;
                        event.preventDefault();
                        selectDeckTab(next);
                        deckTabRefs.current[next]?.focus();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <section
                  role="tabpanel"
                  id="deck-cards-panel"
                  aria-labelledby="deck-cards-tab"
                  tabIndex={0}
                  hidden={deckTab !== "cards"}
                  className="space-y-4"
                >
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={showGeneration}
                      aria-controls="deck-generation-options"
                      onClick={() => setShowGeneration((value) => !value)}
                    >
                      <Sparkles aria-hidden="true" className="size-4 text-accent" />
                      Generar más cartas
                    </Button>
                  </div>
                  <section
                    id="deck-generation-options"
                    hidden={!showGeneration}
                    aria-label="Generar más cartas"
                    className="rounded-lg border border-line p-5"
                  >
                    <h3 className="flex items-center gap-2 font-display font-semibold">
                      <Sparkles aria-hidden="true" className="size-4 text-accent" />
                      Generar más cartas
                    </h3>
                    <p className="mt-1 text-body-sm text-fg-muted">
                      Las nuevas cartas se agregan al mazo sin modificar las actuales.
                    </p>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div className="space-y-2">
                        <label
                          htmlFor="additional-card-count"
                          className="block text-body-sm text-fg-muted"
                        >
                          Cantidad para generar
                        </label>
                        <Input
                          id="additional-card-count"
                          aria-describedby="additional-generation-limit"
                          type="number"
                          min={1}
                          max={MAX_GENERATION_COUNT}
                          step={1}
                          value={count}
                          onChange={(event) => setCount(event.target.value)}
                          disabled={busy || running || archived}
                          className="w-24"
                        />
                        <span
                          id="additional-generation-limit"
                          className="block text-body-sm text-fg-muted"
                        >
                          Máximo {MAX_GENERATION_COUNT} cartas por generación.
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        disabled={busy || running || archived}
                        onClick={() =>
                          void act(async () => {
                            const amount = Number(count);
                            if (
                              !Number.isInteger(amount) ||
                              amount < 1 ||
                              amount > MAX_GENERATION_COUNT
                            )
                              throw new RequestFailure(
                                400,
                                `La cantidad debe ser un entero entre 1 y ${MAX_GENERATION_COUNT}.`,
                              );
                            await requestGeneration(amount, () =>
                              api<JobView>(
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
                    </div>
                  </section>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                    <h3 className="font-display text-h3">Revisar cartas</h3>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 text-body-sm">
                      <ListFilter aria-hidden="true" className="size-4 text-fg-muted" />
                      <input
                        type="checkbox"
                        className="size-5 accent-accent"
                        checked={onlyExcluded}
                        onChange={(event) => setOnlyExcluded(event.target.checked)}
                      />
                      Solo excluidas
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="card-search" className="block text-body-sm text-fg-muted">
                      Buscar cartas
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="card-search"
                        type="search"
                        value={cardSearch}
                        onChange={(event) => setCardSearch(event.target.value)}
                        placeholder="Objetivo o palabra prohibida"
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={!cardSearch}
                        onClick={() => setCardSearch("")}
                      >
                        Limpiar búsqueda
                      </Button>
                    </div>
                    {searchQuery && (
                      <p role="status" className="text-body-sm text-fg-muted">
                        Resultados: {filteredCards.length} de {cards.length} cartas
                      </p>
                    )}
                  </div>
                  {deck && visibleCards.length === 0 && (
                    <div
                      role="status"
                      className="space-y-3 rounded-lg border border-dashed border-line p-6 text-center"
                    >
                      <h3 className="font-display font-semibold">
                        {searchQuery
                          ? "No hay cartas que coincidan"
                          : onlyExcluded
                            ? "No hay cartas excluidas"
                            : "Este mazo todavía no tiene cartas"}
                      </h3>
                      <p className="text-body-sm text-fg-muted">
                        {searchQuery
                          ? "Prueba con otra palabra o limpia la búsqueda."
                          : onlyExcluded
                            ? "Ninguna carta coincide con este filtro."
                            : archived
                              ? "Restaura el mazo para generar nuevas cartas."
                              : "Genera cartas con las opciones de arriba. El progreso se actualiza automáticamente."}
                      </p>
                      {onlyExcluded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setOnlyExcluded(false);
                            setCardSearch("");
                          }}
                        >
                          Ver todas las cartas
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="grid gap-4 xl:grid-cols-2">
                    {visibleCards.map((card) => (
                      <article
                        key={card.id}
                        className="min-w-0 rounded-lg border border-line bg-surface-2 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="min-w-0 font-display text-h3 break-words">{card.word}</h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-pill px-3 py-1 text-caption ${card.excluded ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
                          >
                            {card.excluded ? (
                              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                            ) : (
                              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
                            )}
                            {card.excluded
                              ? "Excluida"
                              : card.manualOverride
                                ? "Habilitada manualmente"
                                : "Disponible"}
                          </span>
                        </div>
                        <p className="mt-4 text-caption text-fg-muted">Palabras prohibidas</p>
                        <ol className="mt-2 grid grid-cols-2 gap-2">
                          {card.taboo.map((word, index) => (
                            <li
                              key={`${index}-${word}`}
                              className="rounded-md border border-line bg-surface px-3 py-2 text-body-sm break-words"
                            >
                              {word}
                            </li>
                          ))}
                        </ol>
                        {card.taboo.length < 6 && (
                          <p
                            id={`card-${card.id}-incomplete`}
                            className="mt-3 text-body-sm text-warning"
                          >
                            Faltan prohibidas para completar las seis.
                          </p>
                        )}
                        {card.issues.length > 0 && (
                          <details className="mt-4 text-body-sm">
                            <summary className="min-h-11 cursor-pointer py-3 text-warning">
                              Ver advertencias ({card.issues.length})
                            </summary>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {card.issues.map((issue, index) => (
                                <li key={`${index}-${issue}`}>{issue}</li>
                              ))}
                            </ul>
                            <p className="mt-2 text-fg-muted">
                              Una palabra desconocida puede ser un regionalismo. Habilitar la carta
                              no elimina estas advertencias.
                            </p>
                          </details>
                        )}
                        <CardEditor
                          card={card}
                          disabled={busy || running || archived}
                          onSave={async (input) => {
                            let saved = false;
                            await act(async () => {
                              await api(
                                `/api/admin/decks/${encodeURIComponent(deck.id)}/cards/${encodeURIComponent(card.id)}`,
                                {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(input),
                                },
                              );
                              saved = true;
                            });
                            return saved;
                          }}
                        />
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                          <Button
                            size="sm"
                            variant={card.excluded ? "caution" : "ghost"}
                            aria-describedby={
                              card.excluded && card.taboo.length < 6
                                ? `card-${card.id}-incomplete`
                                : undefined
                            }
                            disabled={
                              busy ||
                              running ||
                              archived ||
                              (card.excluded && card.taboo.length !== 6)
                            }
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
                            disabled={busy || running || archived}
                            onClick={() =>
                              void act(async () =>
                                requestGeneration(1, () =>
                                  api<JobView>(
                                    `/api/admin/decks/${encodeURIComponent(deck!.id)}/cards/${encodeURIComponent(card.id)}/replace`,
                                    { method: "POST" },
                                  ),
                                ),
                              )
                            }
                          >
                            Reemplazar con IA
                          </Button>
                          <CardDeletion
                            word={card.word}
                            disabled={busy || running || archived}
                            onDelete={async () => {
                              await act(async () => {
                                await api(
                                  `/api/admin/decks/${encodeURIComponent(deck.id)}/cards/${encodeURIComponent(card.id)}`,
                                  { method: "DELETE" },
                                );
                              });
                            }}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                  {deck && filteredCards.length > 0 && (
                    <nav
                      aria-label="Paginación de cartas"
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
                    >
                      <p className="text-body-sm text-fg-muted" aria-live="polite">
                        Mostrando {pageStart + 1}–
                        {Math.min(pageStart + cardsPerPage, filteredCards.length)} de{" "}
                        {filteredCards.length} cartas
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => setCardsPage(currentPage - 1)}
                        >
                          <ChevronLeft aria-hidden="true" className="size-4" />
                          Anterior
                        </Button>
                        <span aria-current="page" className="text-body-sm">
                          Página {currentPage} de {totalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentPage === totalPages}
                          onClick={() => setCardsPage(currentPage + 1)}
                        >
                          Siguiente
                          <ChevronRight aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </nav>
                  )}
                </section>
                <section
                  role="tabpanel"
                  id="deck-settings-panel"
                  aria-labelledby="deck-settings-tab"
                  tabIndex={0}
                  hidden={deckTab !== "settings"}
                  className="rounded-lg border border-line p-5"
                >
                  <h3 className="mb-4 font-display font-semibold">Ajustes del mazo</h3>
                  <DeckManagement
                    deck={deck}
                    busy={busy}
                    running={running}
                    api={api}
                    act={act}
                    onArchived={handleArchived}
                    onDeleted={handleDeleted}
                  />
                </section>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
