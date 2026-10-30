import type { AdminCardView, AdminDeckView } from "../deck-management";

/**
 * Contratos compartidos por el tablero de administración.
 *
 * Son sólo tipos y catálogos: ninguna función, ningún estado. El tablero
 * coordina y las piezas de `dashboard/` presentan.
 */

/** Pestañas principales del panel, en el orden en que se muestran. */
export const ADMIN_TABS = [
  ["create", "Crear mazo"],
  ["decks", "Mazos"],
  ["settings", "Configuración"],
] as const;

/** Identificador de una pestaña principal. */
export type AdminTab = (typeof ADMIN_TABS)[number][0];

/** Subpestañas del mazo seleccionado, en el orden en que se muestran. */
export const DECK_TABS = [
  ["cards", "Cartas"],
  ["settings", "Ajustes"],
] as const;

/** Identificador de una subpestaña del mazo. */
export type DeckTab = (typeof DECK_TABS)[number][0];

/** Mazo administrable tal como lo ve el panel. */
export type DeckView = AdminDeckView;

/** Carta administrable tal como la ve el panel. */
export type CardView = AdminCardView;

/** Trabajo de generación tal como lo ve el panel. */
export type JobView = {
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

/**
 * Vista del listado de cartas: búsqueda, filtro de excluidas y página.
 *
 * El tablero la conserva porque el filtro y la búsqueda sobreviven al cambio
 * de subpestaña y la búsqueda se limpia al cambiar de mazo.
 */
export type CardListView = {
  /** Texto buscado por el administrador, sin normalizar. */
  search: string;
  /** Muestra sólo las cartas excluidas. */
  onlyExcluded: boolean;
  /** Página visible del listado paginado. */
  page: number;
};

/**
 * Envoltura de acciones del tablero: informa errores y refresca el catálogo.
 *
 * La comparten las piezas que necesitan hablar con la API: informa el fallo
 * y deja el panel en un estado coherente sin duplicar ese contrato.
 */
export type AdminAction = (action: () => Promise<void>) => Promise<void>;
