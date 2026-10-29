/**
 * Error de la API administrativa: lleva el status HTTP y un código estable.
 * El mensaje es seguro para mostrar; nunca contiene texto crudo del proveedor,
 * de la base de datos ni secretos.
 */
export type AdminErrorStatus = 400 | 404 | 409 | 503;

export class AdminError extends Error {
  constructor(
    readonly status: AdminErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }

  /** Forma segura de serializar hacia el cliente. */
  toJSON(): { code: string; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function adminInvalid(message: string): AdminError {
  return new AdminError(400, "invalid_input", message);
}

export function adminNotFound(message: string): AdminError {
  return new AdminError(404, "not_found", message);
}

export function adminConflict(code: string, message: string): AdminError {
  return new AdminError(409, code, message);
}

export function adminUnavailable(code: string, message: string): AdminError {
  return new AdminError(503, code, message);
}

/** `true` cuando el error ya es un `AdminError` (no hay que envolverlo). */
export function isAdminError(error: unknown): error is AdminError {
  return error instanceof AdminError;
}
