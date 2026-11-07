import { z } from "zod";

import { AdminError } from "../../application/admin/errors";
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_MODELS,
  type DeepSeekModel,
} from "../../application/admin/settings";
import {
  DEFAULT_BATCH_SIZE,
  MAX_GENERATION_COUNT,
} from "../../application/admin/generation-limits";
import { MAX_CANDIDATES_PER_CARD } from "../../application/admin/candidates";
import type {
  CandidatesPayload,
  GenerationProvider,
  ProposedCard,
  ProviderResult,
  ProviderUsage,
} from "../../application/admin/ports";

/** Endpoint fijo: nunca se construye desde datos del usuario (sin SSRF). */
export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

/** Default for existing jobs and callers without a selected model. */
export const DEEPSEEK_MODEL = DEFAULT_DEEPSEEK_MODEL;

/** Límite de la respuesta del proveedor. */
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 2_000;

/** Límite de tiempo de cada llamada al proveedor. */
export const DEEPSEEK_TIMEOUT_MS = 20_000;

/** Large initial batches get a bounded deadline below the default 60-second lease. */
export const DEEPSEEK_BATCH_TIMEOUT_MS = 45_000;

/**
 * The single objectives call is long but happens once per job. It stays below
 * `DEFAULT_LEASE_MS` (60 s) on purpose: a provider call that outlives the lease
 * leaves the job stranded in `running` with no error.
 */
export const DEEPSEEK_OBJECTIVES_TIMEOUT_MS = 50_000;

/**
 * Output budget of the objectives call.
 *
 * The answer is a short list of words, but the request carries every objective
 * the deck already has: the model has to reason against a long list before it
 * answers. With the generic budget the reasoning used it all and the answer
 * came back cut, which the panel reported as an invalid provider response.
 */
export const DEEPSEEK_OBJECTIVES_MAX_OUTPUT_TOKENS = 8_000;

/** Candidatos máximos por carta (S5). */
export { MAX_CANDIDATES_PER_CARD } from "../../application/admin/candidates";

/** Cuántas palabras ya usadas se le recuerdan al modelo. */
const MAX_EXCLUDED_IN_PROMPT = 200;

/** `fetch` inyectable para poder probar el proveedor sin llamadas reales. */
export type AdminFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface DeepSeekProviderOptions {
  readonly apiKey: string;
  readonly fetchImpl?: AdminFetch;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  /**
   * Avisa que una respuesta del proveedor no se pudo leer.
   *
   * Sólo viaja la FORMA de la respuesta (la fase, el motivo, la longitud y las
   * claves de primer nivel): nunca el contenido, nunca un secreto. Sirve para
   * diagnosticar una repetición sin exponer lo que dijo el proveedor.
   */
  readonly onInvalidResponse?: (detail: InvalidResponseDetail) => void;
}

/** Diagnóstico seguro de una respuesta que el proveedor no pudo entregar. */
export interface InvalidResponseDetail {
  /** Fase de la llamada: "objectives", "cards", "batch" o "candidates". */
  readonly phase: string;
  /** Motivo: "schema", "truncated", "no_answer" o "not_json". */
  readonly reason: string;
  /** Por qué terminó la respuesta del proveedor ("stop", "length", ...). */
  readonly finishReason: string | null;
  /** Longitud del contenido recibido: nunca el contenido. */
  readonly contentLength: number;
  /** Claves de primer nivel del payload: nunca los valores. */
  readonly payloadKeys: readonly string[];
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

/** Claves que el proveedor puede usar para nombrar el objetivo de una carta. */
const OBJECTIVE_KEYS = ["objective", "objetivo", "word", "palabra", "text"] as const;

/** Claves que el proveedor puede usar para nombrar las palabras prohibidas. */
const CANDIDATE_KEYS = ["candidates", "proposals", "palabras", "words"] as const;

/** Lee el primer valor presente entre las claves candidatas. */
function pick(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

/** Las claves de primer nivel de un payload: la forma, nunca los valores. */
function payloadKeysOf(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return [];
  }

  return Object.keys(payload as Record<string, unknown>);
}

/**
 * Lee una lista de textos de una respuesta del proveedor.
 *
 * El modelo no siempre contesta con la forma exacta que pide el prompt: la
 * lista puede venir separada por comas, envuelta en objetos o con otra clave.
 * Todo eso es la misma respuesta y se lee sin perder palabras.
 */
function readTextList(value: unknown, keys: readonly string[]): string[] | null {
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const items: string[] = [];

  for (const entry of value) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        items.push(trimmed);
      }
      continue;
    }

    if (typeof entry === "object" && entry !== null) {
      const found = pick(entry as Record<string, unknown>, keys);
      if (typeof found === "string" && found.trim().length > 0) {
        items.push(found.trim());
      }
    }
  }

  return items;
}

/** Lee las cartas de una respuesta del proveedor. */
function readCards(value: unknown): { objective: string; candidates: string[] }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards: { objective: string; candidates: string[] }[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const objective = pick(record, OBJECTIVE_KEYS);

    if (typeof objective !== "string" || objective.trim().length === 0) {
      continue;
    }

    cards.push({
      objective: objective.trim(),
      candidates: readTextList(pick(record, CANDIDATE_KEYS), CANDIDATE_KEYS) ?? [],
    });
  }

  return cards;
}

/** Lee los objetivos de una respuesta del proveedor. */
function readObjectives(payload: unknown): string[] | null {
  if (Array.isArray(payload)) {
    return readTextList(payload, OBJECTIVE_KEYS);
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const value = pick(payload as Record<string, unknown>, ["objectives", "objetivos"]);

  return value === undefined ? null : readTextList(value, OBJECTIVE_KEYS);
}

/** Lee las cartas propuestas de una respuesta del proveedor. */
function readProposedCards(payload: unknown): { objective: string; candidates: string[] }[] | null {
  if (Array.isArray(payload)) {
    return readCards(payload);
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const value = pick(payload as Record<string, unknown>, ["cards", "cartas"]);

  return value === undefined ? null : readCards(value);
}

/** Lee las palabras prohibidas de una respuesta del proveedor. */
function readCandidates(payload: unknown): string[] | null {
  if (Array.isArray(payload)) {
    return readTextList(payload, CANDIDATE_KEYS);
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const value = pick(payload as Record<string, unknown>, ["candidates", "palabras"]);

  return value === undefined ? null : readTextList(value, CANDIDATE_KEYS);
}

/** Saca el JSON del contenido: el proveedor a veces lo envuelve en un bloque. */
function parseContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/u.exec(trimmed);

  return JSON.parse(fenced?.[1] ?? trimmed);
}

const SYSTEM_PROMPT = [
  "Generas contenido para un juego de taboo en español.",
  "Responde siempre con un único objeto JSON válido y nada más.",
].join(" ");

/**
 * Generation provider for the explicitly selected DeepSeek model.
 *
 * Reglas (S5, S8):
 * - allowlisted Flash/Pro selection, without automatic fallback;
 * - endpoint fijo, clave sólo desde el entorno del servidor;
 * - sin herramientas, sin streaming y con salida acotada;
 * - la respuesta se valida con Zod y los errores nunca filtran el cuerpo
 *   crudo del proveedor ni la clave.
 */
export function createDeepSeekProvider(options: DeepSeekProviderOptions): GenerationProvider {
  const apiKey = options.apiKey.trim();
  const fetchImpl: AdminFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  /** Avisa una respuesta ilegible sin exponer su contenido. */
  function reportInvalid(detail: InvalidResponseDetail): void {
    try {
      options.onInvalidResponse?.(detail);
    } catch {
      /* Un diagnóstico fallido nunca rompe la generación. */
    }
  }

  interface ProviderRequest {
    readonly prompt: string;
    /** Fase de la llamada: sirve para el diagnóstico. */
    readonly phase: string;
    readonly signal?: AbortSignal | undefined;
    readonly requestedCards?: number | undefined;
    readonly model?: DeepSeekModel | undefined;
    readonly timeoutMs?: number | undefined;
    readonly maxOutputTokens?: number | undefined;
  }

  async function request(input: ProviderRequest): Promise<{
    payload: unknown;
    usage: ProviderUsage;
    contentLength: number;
  }> {
    const requestedCards = input.requestedCards ?? 1;
    const model = input.model ?? DEFAULT_DEEPSEEK_MODEL;

    if (!DEEPSEEK_MODELS.includes(model)) {
      throw new AdminError(400, "invalid_model", "Unsupported DeepSeek model");
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        controller.abort();
      },
      options.timeoutMs ??
        input.timeoutMs ??
        (requestedCards > 5 ? DEEPSEEK_BATCH_TIMEOUT_MS : DEEPSEEK_TIMEOUT_MS),
    );
    const onAbort = (): void => {
      controller.abort();
    };

    input.signal?.addEventListener("abort", onAbort);

    try {
      const response = await fetchImpl(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          max_tokens:
            options.maxOutputTokens ??
            input.maxOutputTokens ??
            Math.max(
              DEEPSEEK_MAX_OUTPUT_TOKENS,
              Math.min(DEFAULT_BATCH_SIZE, requestedCards) * 400,
            ),
          stream: false,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: input.prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AdminError(
          503,
          "provider_unavailable",
          "The generation provider rejected the request",
        );
      }

      const raw: unknown = await response.json();
      const parsed = completionSchema.safeParse(raw);

      if (!parsed.success) {
        reportInvalid({
          phase: input.phase,
          reason: "schema",
          finishReason: null,
          contentLength: 0,
          payloadKeys: [],
        });
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      const choice = parsed.data.choices[0];
      const content = choice?.message.content ?? "";
      const finishReason = choice?.finish_reason ?? null;

      // Una respuesta cortada no es una respuesta inválida: se distingue para
      // poder reintentar con más presupuesto y para explicarlo en el panel.
      if (finishReason === "length") {
        reportInvalid({
          phase: input.phase,
          reason: "truncated",
          finishReason,
          contentLength: content.length,
          payloadKeys: [],
        });
        throw new AdminError(
          503,
          "provider_response_truncated",
          "The generation provider's answer was cut off",
        );
      }

      // El servicio saturado responde con un turno vacío: no es un problema de
      // la respuesta, es del proveedor y se resuelve preguntando de nuevo.
      if (finishReason === "insufficient_system_resource") {
        reportInvalid({
          phase: input.phase,
          reason: "no_answer",
          finishReason,
          contentLength: content.length,
          payloadKeys: [],
        });
        throw new AdminError(
          503,
          "provider_no_answer",
          "The generation provider could not answer right now",
        );
      }

      let payload: unknown;

      try {
        payload = parseContent(content);
      } catch {
        reportInvalid({
          phase: input.phase,
          reason: "not_json",
          finishReason,
          contentLength: content.length,
          payloadKeys: [],
        });
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        payload,
        usage: {
          inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
          outputTokens: parsed.data.usage?.completion_tokens ?? 0,
        },
        contentLength: content.length,
      };
    } catch (error) {
      if (error instanceof AdminError) {
        throw error;
      }

      throw new AdminError(503, "provider_unavailable", "The generation provider is unavailable");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    available: apiKey.length > 0,

    async proposeObjectives(input): Promise<ProviderResult<{ objectives: readonly string[] }>> {
      // Repeats are discarded locally, so the bounded prompt keeps the newest
      // used objectives and pays nothing for an objective that comes back again.
      const excluded = input.excludedObjectives.slice(-MAX_GENERATION_COUNT);
      const avoid = excluded.length > 0 ? excluded.join(", ") : "ninguno";

      const { payload, usage, contentLength } = await request({
        phase: "objectives",
        prompt: [
          `Tema: "${input.theme}".`,
          `Propone ${input.count} objetivos distintos de cartas de taboo para ese tema.`,
          input.allowProperNames
            ? 'Cada objetivo puede ser un nombre propio o un título de varias palabras, como "Juego de tronos", con su ortografía correcta.'
            : "Cada objetivo es una sola palabra en español, de cuatro a doce letras,",
          input.allowProperNames
            ? "y tiene que poder describirse sin nombrarlo."
            : "que cualquiera pueda describir sin decirla.",
          "Los objetivos no se repiten entre sí.",
          `No repitas ninguno de estos objetivos ya usados en el mazo: ${avoid}.`,
          'Responde con {"objectives":["...","..."]}.',
        ].join(" "),
        signal: input.signal,
        requestedCards: input.count,
        model: input.model,
        timeoutMs: DEEPSEEK_OBJECTIVES_TIMEOUT_MS,
        maxOutputTokens: DEEPSEEK_OBJECTIVES_MAX_OUTPUT_TOKENS,
      });

      const parsed = readObjectives(payload);

      if (parsed === null) {
        reportInvalid({
          phase: "objectives",
          reason: "shape",
          finishReason: null,
          contentLength,
          payloadKeys: payloadKeysOf(payload),
        });
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: { objectives: parsed.slice(0, input.count) },
        usage,
      };
    },

    async proposeCandidatesBatch(
      input,
    ): Promise<ProviderResult<{ cards: readonly ProposedCard[] }>> {
      const objectives = input.objectives.map((objective, index) => `${index + 1}) "${objective}"`);

      const { payload, usage, contentLength } = await request({
        phase: "batch",
        prompt: [
          `Tema: "${input.theme}".`,
          `Para cada uno de estos ${input.objectives.length} objetivos, da hasta ${MAX_CANDIDATES_PER_CARD} palabras prohibidas`,
          input.allowProperNames
            ? "en español, que pueden ser nombres propios y títulos de varias palabras,"
            : "en español, cada una de una sola palabra,",
          "ordenadas de la mejor a la peor para que no las adivine quien ve el objetivo.",
          ...(input.allowProperNames
            ? ["No uses partes del objetivo como palabras prohibidas."]
            : []),
          `Objetivos: ${objectives.join(" ")}.`,
          "Devuelve exactamente esos objetivos, con el mismo texto y en el mismo orden.",
          ...(input.rules
            ? [
                `Reglas para las palabras prohibidas: ${input.rules}\nConserva las restricciones de validación y el formato JSON.`,
              ]
            : []),
          'Responde con {"cards":[{"objective":"...","candidates":["..."]}]}.',
        ].join(" "),
        signal: input.signal,
        requestedCards: input.objectives.length,
        model: input.model,
        timeoutMs: DEEPSEEK_BATCH_TIMEOUT_MS,
      });

      const parsed = readProposedCards(payload);

      if (parsed === null) {
        reportInvalid({
          phase: "batch",
          reason: "shape",
          finishReason: null,
          contentLength,
          payloadKeys: payloadKeysOf(payload),
        });
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: {
          cards: parsed.slice(0, input.objectives.length).map((card) => ({
            objective: card.objective,
            candidates: card.candidates.slice(0, MAX_CANDIDATES_PER_CARD),
          })),
        },
        usage,
      };
    },

    async proposeCandidates(input): Promise<ProviderResult<CandidatesPayload>> {
      const previous = input.previousWords.slice(-MAX_EXCLUDED_IN_PROMPT);
      const selected = input.selected.slice(-MAX_EXCLUDED_IN_PROMPT);
      const rejected = input.rejected.slice(-MAX_EXCLUDED_IN_PROMPT);
      const list = (values: readonly string[]): string =>
        values.length > 0 ? values.join(", ") : "ninguna";

      const { payload, usage, contentLength } = await request({
        phase: "candidates",
        prompt: [
          `Tema: "${input.theme}".`,
          `Objetivo de la carta: "${input.objective}".`,
          `Palabras ya propuestas para esta carta: ${list(previous)}.`,
          `Palabras ya seleccionadas: ${list(selected)}.`,
          `Palabras descartadas: ${list(rejected)}.`,
          input.allowProperNames
            ? `Da hasta ${MAX_CANDIDATES_PER_CARD} términos prohibidos nuevos en español,`
            : `Da hasta ${MAX_CANDIDATES_PER_CARD} palabras prohibidas nuevas, cada una de una sola palabra en español,`,
          "ordenadas de la mejor a la peor para que no las adivine quien ve el objetivo.",
          "No repitas ninguna de las palabras ya propuestas.",
          ...(input.allowProperNames
            ? [
                'El objetivo puede ser un nombre propio o título. Las prohibidas también pueden ser nombres propios y títulos de varias palabras, como "Ned Stark"; no uses partes del objetivo como palabras prohibidas.',
              ]
            : []),
          "Puedes devolver menos de 12 o ninguna.",
          ...(input.rules
            ? [
                `Reglas para las palabras prohibidas: ${input.rules}\nConserva las restricciones de validación y el formato JSON.`,
              ]
            : []),
          'Responde con {"candidates":["..."]}.',
        ].join(" "),
        signal: input.signal,
        requestedCards: 1,
        model: input.model,
      });

      const parsed = readCandidates(payload);

      if (parsed === null) {
        reportInvalid({
          phase: "candidates",
          reason: "shape",
          finishReason: null,
          contentLength,
          payloadKeys: payloadKeysOf(payload),
        });
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: { candidates: parsed.slice(0, MAX_CANDIDATES_PER_CARD) },
        usage,
      };
    },
  };
}
