"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/ui/components/ui/button";
import { Spinner } from "@/ui/components/ui/spinner";
import {
  createAdminSocket,
  type AdminConnectionState,
  type AdminSocketClient,
} from "@/ui/lib/admin-socket";

import { AdminLogin } from "./login/admin-login";
import { DeckManagement } from "./deck-management";
import { ModelSettings } from "./model-settings";
import { api, RequestFailure } from "./dashboard/api-client";
import { CardList } from "./dashboard/card-list";
import { CreateDeckForm } from "./dashboard/create-deck-form";
import { DeckCatalog } from "./dashboard/deck-catalog";
import { DeckWorkspace } from "./dashboard/deck-workspace";
import { GenerateCardsForm } from "./dashboard/generate-cards-form";
import { GenerationFeedback } from "./dashboard/generation-feedback";
import {
  parseGenerationAmount,
  requestCardReplacement,
  requestDeckGeneration,
} from "./dashboard/generation-request";
import {
  ADMIN_TABS,
  type AdminTab,
  type CardListView,
  type DeckTab,
  type DeckView,
  type JobView,
} from "./dashboard/types";

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

/**
 * Tablero del panel de administración.
 *
 * Coordina: mantiene la sesión, el socket de progreso, el trabajo en curso y
 * los borradores de los formularios. Las piezas de `dashboard/` sólo presentan
 * y devuelven la intención del administrador.
 */
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

  /** El catálogo elige el mazo abierto y avisa si debe recargarlo. */
  function selectDeck(deckId: string) {
    selectionClearedRef.current = false;

    if (deckId === selectedId) {
      // Mismo mazo: la selección no cambia, así que el efecto no
      // vuelve a pedir el detalle. Se relee para no dejar el
      // panel en blanco hasta que alguien toque Actualizar.
      setRefresh((value) => value + 1);
      return;
    }

    setSelectedId(deckId);
    setDeck(null);
  }

  /** Abre la pestaña de creación desde el catálogo vacío. */
  function openCreateTab() {
    selectTab("create");
    tabRefs.current.create?.focus();
  }

  /** Aplica los cambios de la vista del listado de cartas. */
  function updateCardListView(patch: Partial<CardListView>) {
    if (patch.search !== undefined) setCardSearch(patch.search);
    if (patch.onlyExcluded !== undefined) setOnlyExcluded(patch.onlyExcluded);
    if (patch.page !== undefined) setCardsPage(patch.page);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const amount = parseGenerationAmount(count);

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
        trackJob(await requestDeckGeneration(created.id, amount));
      } finally {
        setCreating(null);
      }
    });
  }

  /** Encola más cartas para el mazo abierto. */
  async function generateMoreCards() {
    const current = deck;
    if (current === null) return;
    await act(async () => {
      const amount = parseGenerationAmount(count);
      await requestGeneration(amount, () => requestDeckGeneration(current.id, amount));
    });
  }

  /** Encola el reemplazo automático de una carta. */
  async function replaceCard(cardId: string) {
    const current = deck;
    if (current === null) return;
    await act(async () => requestGeneration(1, () => requestCardReplacement(current.id, cardId)));
  }

  const running = job?.status === "queued" || job?.status === "running";
  const cards = deck?.cards ?? [];
  const archived = deck?.archivedAt !== undefined;
  const cardActionsDisabled = busy || running || archived;
  const cardListView: CardListView = { search: cardSearch, onlyExcluded, page: cardsPage };

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
        <CreateDeckForm
          name={name}
          theme={theme}
          rules={rules}
          allowProperNames={allowProperNames}
          count={count}
          busy={busy}
          running={running}
          onNameChange={setName}
          onThemeChange={setTheme}
          onRulesChange={setRules}
          onAllowProperNamesChange={setAllowProperNames}
          onCountChange={setCount}
          onSubmit={create}
        />
      </section>

      <GenerationFeedback
        creating={creating}
        job={job}
        running={running}
        connection={connection}
        dismissedJobId={dismissedJobId}
      />

      <section
        role="tabpanel"
        id="admin-decks-panel"
        aria-labelledby="admin-decks-tab"
        hidden={activeTab !== "decks"}
        tabIndex={0}
        className="rounded-lg border border-line bg-surface p-4 md:p-6"
      >
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <DeckCatalog
            decks={decks}
            selectedId={selectedId}
            loading={catalogLoading}
            showArchived={showArchived}
            onToggleArchived={toggleArchived}
            onSelectDeck={selectDeck}
            onRefresh={() => setRefresh((value) => value + 1)}
            onCreateDeck={openCreateTab}
          />

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
                <DeckWorkspace deck={deck} deckTab={deckTab} onDeckTabChange={selectDeckTab} />
                <section
                  role="tabpanel"
                  id="deck-cards-panel"
                  aria-labelledby="deck-cards-tab"
                  tabIndex={0}
                  hidden={deckTab !== "cards"}
                  className="space-y-4"
                >
                  <GenerateCardsForm
                    count={count}
                    expanded={showGeneration}
                    disabled={cardActionsDisabled}
                    onCountChange={setCount}
                    onToggle={() => setShowGeneration((value) => !value)}
                    onGenerate={() => void generateMoreCards()}
                  />
                  <CardList
                    deckId={deck.id}
                    cards={cards}
                    view={cardListView}
                    archived={archived}
                    disabled={cardActionsDisabled}
                    api={api}
                    act={act}
                    onViewChange={updateCardListView}
                    onReplaceCard={(cardId) => void replaceCard(cardId)}
                  />
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
