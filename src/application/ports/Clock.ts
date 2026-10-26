/** Reloj inyectable: el dominio nunca llama a `Date.now()` (S13). */
export interface Clock {
  now(): Date;
}
