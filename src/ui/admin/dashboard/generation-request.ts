import { MAX_GENERATION_COUNT } from "@/application/admin/generation-limits";

import { api, RequestFailure } from "./api-client";
import type { JobView } from "./types";

/**
 * Peticiones de generación del panel: URLs, métodos y cuerpos.
 *
 * La cantidad se valida una sola vez para el formulario de creación y para
 * la generación adicional, así ambos caminos muestran el mismo mensaje.
 */

/**
 * Convierte la cantidad escrita por el administrador en un número válido.
 *
 * Lanza `RequestFailure` con el mensaje del panel cuando la cantidad no es
 * un entero dentro del rango permitido.
 */
export function parseGenerationAmount(value: string): number {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GENERATION_COUNT)
    throw new RequestFailure(
      400,
      `La cantidad debe ser un entero entre 1 y ${MAX_GENERATION_COUNT}.`,
    );
  return amount;
}

/** Encola una generación de cartas para un mazo. */
export function requestDeckGeneration(deckId: string, count: number): Promise<JobView> {
  return api<JobView>(`/api/admin/decks/${encodeURIComponent(deckId)}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
}

/** Encola el reemplazo automático de una carta. */
export function requestCardReplacement(deckId: string, cardId: string): Promise<JobView> {
  return api<JobView>(
    `/api/admin/decks/${encodeURIComponent(deckId)}/cards/${encodeURIComponent(cardId)}/replace`,
    { method: "POST" },
  );
}
