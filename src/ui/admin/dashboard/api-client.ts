/**
 * Cliente HTTP del panel de administración.
 *
 * Vive fuera del tablero para que las piezas presentacionales hablen con la
 * API sin duplicar la pila de red ni el manejo de errores tipados.
 */

/** Error de una respuesta del panel, con su código HTTP. */
export class RequestFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Pide un recurso del panel con la sesión del navegador.
 *
 * Las respuestas correctas envuelven el dato en `data`; las fallidas lanzan
 * `RequestFailure` con el mensaje del servidor.
 */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const result = (await response.json()) as { data: T; error?: string };
  if (!response.ok)
    throw new RequestFailure(response.status, result.error ?? "No se pudo completar la solicitud.");
  return result.data;
}
