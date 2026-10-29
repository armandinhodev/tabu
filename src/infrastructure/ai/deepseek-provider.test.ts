import { describe, expect, it } from "vitest";

import { AdminError } from "../../application/admin/errors";
import {
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODEL,
  createDeepSeekProvider,
  type AdminFetch,
} from "./deepseek-provider";

function completion(content: string, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1,
    model: DEEPSEEK_MODEL,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: usage ?? { prompt_tokens: 11, completion_tokens: 13, total_tokens: 24 },
  };
}

function fakeFetch(
  body: unknown,
  status = 200,
): {
  fetch: AdminFetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];

  const fetch: AdminFetch = async (url, init) => {
    calls.push({ url, init });

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  };

  return { fetch, calls };
}

function bodyOf(calls: { init: RequestInit }[]): Record<string, unknown> {
  return JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
}

function promptOf(calls: { init: RequestInit }[]): string {
  const messages = bodyOf(calls).messages as { role: string; content: string }[];

  return messages.map((message) => message.content).join(" ");
}

describe("createDeepSeekProvider", () => {
  it("calls only deepseek-flash at the fixed endpoint", async () => {
    const { fetch, calls } = fakeFetch(completion('{"cards":[]}'));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    await provider.proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(DEEPSEEK_ENDPOINT);
    expect(calls[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    expect(bodyOf(calls).model).toBe("deepseek-flash");
    expect(bodyOf(calls).model).toBe(DEEPSEEK_MODEL);
  });

  it("disables thinking, asks for JSON output and never sends tools", async () => {
    const { fetch, calls } = fakeFetch(completion('{"cards":[]}'));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    await provider.proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] });

    const body = bodyOf(calls);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.tools).toBeUndefined();
    expect(body.stream).toBe(false);
    expect(typeof body.max_tokens).toBe("number");
  });

  it("sends the authorization header with the configured key", async () => {
    const { fetch, calls } = fakeFetch(completion('{"cards":[]}'));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    await provider.proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] });

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-key");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("asks for objectives and ranked candidates in one response", async () => {
    const { fetch, calls } = fakeFetch(completion('{"cards":[]}'));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    await provider.proposeCards({
      theme: "Objetos",
      count: 5,
      excludedObjectives: ["fuego"],
    });

    const prompt = promptOf(calls);
    expect(prompt).toContain("Objetos");
    expect(prompt).toContain("5");
    expect(prompt).toContain("fuego");
    expect(prompt).toContain("objective");
    expect(prompt).toContain("candidates");
    expect(prompt).toContain("12");
  });

  it("reads the cards with their objective and candidates", async () => {
    const { fetch } = fakeFetch(
      completion(
        '{"cards":[{"objective":"fuego","candidates":["llama","chimenea"]},{"objective":"agua","candidates":["rio"]}]}',
      ),
    );
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const result = await provider.proposeCards({
      theme: "Objetos",
      count: 5,
      excludedObjectives: [],
    });

    expect(result.data.cards).toHaveLength(2);
    expect(result.data.cards[0]?.objective).toBe("fuego");
    expect(result.data.cards[0]?.candidates).toEqual(["llama", "chimenea"]);
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 13 });
  });

  it("keeps at most twelve candidates per card", async () => {
    const candidates = Array.from({ length: 20 }, (_, index) => `llama${index}`);
    const { fetch } = fakeFetch(
      completion(JSON.stringify({ cards: [{ objective: "fuego", candidates }] })),
    );
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const result = await provider.proposeCards({
      theme: "Objetos",
      count: 1,
      excludedObjectives: [],
    });

    expect(result.data.cards[0]?.candidates).toHaveLength(12);
  });

  it("keeps at most the requested amount of cards", async () => {
    const cards = Array.from({ length: 8 }, (_, index) => ({
      objective: `objetivo${index}`,
      candidates: ["llama"],
    }));
    const { fetch } = fakeFetch(completion(JSON.stringify({ cards })));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const result = await provider.proposeCards({
      theme: "Objetos",
      count: 5,
      excludedObjectives: [],
    });

    expect(result.data.cards).toHaveLength(5);
  });

  it("asks the completion with the previous words of that card", async () => {
    const { fetch, calls } = fakeFetch(completion('{"candidates":["incendio"]}'));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const result = await provider.proposeCandidates({
      objective: "fuego",
      theme: "Objetos",
      previousWords: ["llama", "chimenea"],
      selected: ["llama"],
      rejected: ["chimenea"],
    });

    const prompt = promptOf(calls);
    expect(prompt).toContain("fuego");
    expect(prompt).toContain("llama");
    expect(prompt).toContain("chimenea");
    expect(result.data.candidates).toEqual(["incendio"]);
  });

  it("rejects a truncated response without leaking the provider body", async () => {
    const truncated = '{"cards":[{"objective":"fuego","cand';
    const { fetch } = fakeFetch(completion(truncated));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const error = await provider
      .proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).status).toBe(503);
    expect((error as AdminError).message).not.toContain("fuego");
    expect((error as AdminError).message).not.toContain("secret-key");
  });

  it("rejects a response that does not match the schema", async () => {
    const { fetch } = fakeFetch(completion('{"unexpected":["fuego"]}'));
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const error = await provider
      .proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).status).toBe(503);
  });

  it("rejects a failed request without leaking the provider body", async () => {
    const { fetch } = fakeFetch({ error: { message: "invalid api key sk-live-1234" } }, 401);
    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });

    const error = await provider
      .proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).status).toBe(503);
    expect((error as AdminError).message).not.toContain("sk-live-1234");
    expect((error as AdminError).message).not.toContain("secret-key");
  });

  it("times out with a bounded deadline", async () => {
    const fetch: AdminFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });

    const provider = createDeepSeekProvider({
      apiKey: "secret-key",
      fetchImpl: fetch,
      timeoutMs: 25,
    });

    const error = await provider
      .proposeCards({ theme: "Objetos", count: 5, excludedObjectives: [] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).status).toBe(503);
    expect((error as AdminError).message).not.toContain("aborted");
  });

  it("stops the request when the caller aborts", async () => {
    const fetch: AdminFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });

    const provider = createDeepSeekProvider({ apiKey: "secret-key", fetchImpl: fetch });
    const controller = new AbortController();

    const pending = provider.proposeCards({
      theme: "Objetos",
      count: 5,
      excludedObjectives: [],
      signal: controller.signal,
    });

    controller.abort();

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminError);
  });

  it("is not available when there is no api key", () => {
    const provider = createDeepSeekProvider({ apiKey: "" });

    expect(provider.available).toBe(false);
  });
});
