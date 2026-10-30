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

/** The single objectives call is long but happens once per job: more room than a batch. */
export const DEEPSEEK_OBJECTIVES_TIMEOUT_MS = 90_000;

/** Candidatos máximos por carta (S5). */
export const MAX_CANDIDATES_PER_CARD = 12;

/** Cuántas palabras ya usadas se le recuerdan al modelo. */
const MAX_EXCLUDED_IN_PROMPT = 200;

/** `fetch` inyectable para poder probar el proveedor sin llamadas reales. */
export type AdminFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface DeepSeekProviderOptions {
  readonly apiKey: string;
  readonly fetchImpl?: AdminFetch;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
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

const candidatesSchema = z.object({ candidates: z.array(z.string()) });
const objectivesSchema = z.object({ objectives: z.array(z.string()) });
const cardsSchema = z.object({
  cards: z.array(
    z.object({
      objective: z.string(),
      candidates: z.array(z.string()),
    }),
  ),
});

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

  async function request(
    userPrompt: string,
    signal: AbortSignal | undefined,
    requestedCards = 1,
    model: DeepSeekModel = DEFAULT_DEEPSEEK_MODEL,
    timeoutMs?: number,
  ): Promise<{ payload: unknown; usage: ProviderUsage }> {
    if (!DEEPSEEK_MODELS.includes(model)) {
      throw new AdminError(400, "invalid_model", "Unsupported DeepSeek model");
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        controller.abort();
      },
      options.timeoutMs ??
        timeoutMs ??
        (requestedCards > 5 ? DEEPSEEK_BATCH_TIMEOUT_MS : DEEPSEEK_TIMEOUT_MS),
    );
    const onAbort = (): void => {
      controller.abort();
    };

    signal?.addEventListener("abort", onAbort);

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
            Math.max(
              DEEPSEEK_MAX_OUTPUT_TOKENS,
              Math.min(DEFAULT_BATCH_SIZE, requestedCards) * 400,
            ),
          stream: false,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
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
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      const content = parsed.data.choices[0]?.message.content ?? "";

      let payload: unknown;

      try {
        payload = JSON.parse(content);
      } catch {
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
      };
    } catch (error) {
      if (error instanceof AdminError) {
        throw error;
      }

      throw new AdminError(503, "provider_unavailable", "The generation provider is unavailable");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    available: apiKey.length > 0,

    async proposeCards(input): Promise<ProviderResult<{ cards: readonly ProposedCard[] }>> {
      // A replacement must never fail because the newest objectives were
      // trimmed from the prompt, so the whole list goes in.
      const excluded = input.excludedObjectives;
      const avoid = excluded.length > 0 ? excluded.join(", ") : "ninguno";

      const { payload, usage } = await request(
        [
          `Tema: "${input.theme}".`,
          `Genera ${input.count} cartas de taboo. Para cada carta:`,
          input.allowProperNames
            ? '- "objective": se permiten nombres propios y títulos de varias palabras, como "Juego de tronos", con su ortografía correcta;'
            : '- "objective": una sola palabra en español, de cuatro a doce letras,',
          "que cualquiera pueda describir sin decirla.",
          input.allowProperNames
            ? '- "candidates": hasta 12 términos prohibidos'
            : '- "candidates": hasta 12 palabras prohibidas, cada una de una sola palabra',
          "en español, ordenadas de la mejor a la peor para que no las adivine quien ve el objetivo.",
          ...(input.allowProperNames
            ? [
                'Las prohibidas también pueden ser nombres propios y títulos de varias palabras, como "Ned Stark" para "Juego de tronos". No uses partes del objetivo como palabras prohibidas.',
              ]
            : []),
          `No repitas ninguno de estos objetivos ya usados en el mazo: ${avoid}.`,
          'Responde con {"cards":[{"objective":"...","candidates":["..."]}]}.',
        ].join(" "),
        input.signal,
        input.count,
        input.model,
      );

      const parsed = cardsSchema.safeParse(payload);

      if (!parsed.success) {
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: {
          cards: parsed.data.cards.slice(0, input.count).map((card) => ({
            objective: card.objective,
            candidates: card.candidates.slice(0, MAX_CANDIDATES_PER_CARD),
          })),
        },
        usage,
      };
    },

    async proposeObjectives(input): Promise<ProviderResult<{ objectives: readonly string[] }>> {
      // Repeats are discarded locally, so the bounded prompt keeps the newest
      // used objectives and pays nothing for an objective that comes back again.
      const excluded = input.excludedObjectives.slice(-MAX_GENERATION_COUNT);
      const avoid = excluded.length > 0 ? excluded.join(", ") : "ninguno";

      const { payload, usage } = await request(
        [
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
        input.signal,
        input.count,
        input.model,
        DEEPSEEK_OBJECTIVES_TIMEOUT_MS,
      );

      const parsed = objectivesSchema.safeParse(payload);

      if (!parsed.success) {
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: { objectives: parsed.data.objectives.slice(0, input.count) },
        usage,
      };
    },

    async proposeCandidatesBatch(
      input,
    ): Promise<ProviderResult<{ cards: readonly ProposedCard[] }>> {
      const objectives = input.objectives.map((objective, index) => `${index + 1}) "${objective}"`);

      const { payload, usage } = await request(
        [
          `Tema: "${input.theme}".`,
          `Para cada uno de estos ${input.objectives.length} objetivos, da hasta 12 palabras prohibidas`,
          input.allowProperNames
            ? "en español, que pueden ser nombres propios y títulos de varias palabras,"
            : "en español, cada una de una sola palabra,",
          "ordenadas de la mejor a la peor para que no las adivine quien ve el objetivo.",
          ...(input.allowProperNames
            ? ["No uses partes del objetivo como palabras prohibidas."]
            : []),
          `Objetivos: ${objectives.join(" ")}.`,
          "Devuelve exactamente esos objetivos, con el mismo texto y en el mismo orden.",
          'Responde con {"cards":[{"objective":"...","candidates":["..."]}]}.',
        ].join(" "),
        input.signal,
        input.objectives.length,
        input.model,
        DEEPSEEK_BATCH_TIMEOUT_MS,
      );

      const parsed = cardsSchema.safeParse(payload);

      if (!parsed.success) {
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: {
          cards: parsed.data.cards.slice(0, input.objectives.length).map((card) => ({
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

      const { payload, usage } = await request(
        [
          `Tema: "${input.theme}".`,
          `Objetivo de la carta: "${input.objective}".`,
          `Palabras ya propuestas para esta carta: ${list(previous)}.`,
          `Palabras ya seleccionadas: ${list(selected)}.`,
          `Palabras descartadas: ${list(rejected)}.`,
          input.allowProperNames
            ? "Da hasta 12 términos prohibidos nuevos en español,"
            : "Da hasta 12 palabras prohibidas nuevas, cada una de una sola palabra en español,",
          "ordenadas de la mejor a la peor para que no las adivine quien ve el objetivo.",
          "No repitas ninguna de las palabras ya propuestas.",
          ...(input.allowProperNames
            ? [
                'El objetivo puede ser un nombre propio o título. Las prohibidas también pueden ser nombres propios y títulos de varias palabras, como "Ned Stark"; no uses partes del objetivo como palabras prohibidas.',
              ]
            : []),
          "Puedes devolver menos de 12 o ninguna.",
          'Responde con {"candidates":["..."]}.',
        ].join(" "),
        input.signal,
        1,
        input.model,
      );

      const parsed = candidatesSchema.safeParse(payload);

      if (!parsed.success) {
        throw new AdminError(
          503,
          "provider_invalid_response",
          "The generation provider returned an invalid response",
        );
      }

      return {
        data: { candidates: parsed.data.candidates.slice(0, MAX_CANDIDATES_PER_CARD) },
        usage,
      };
    },
  };
}
