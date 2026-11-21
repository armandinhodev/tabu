/** @vitest-environment node */
import { afterEach, expect, it, vi } from "vitest";
import { sonioxSpeechProvider } from "./soniox";

class FakeWebSocket {
  static OPEN = 1;
  static latest: FakeWebSocket;
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  close = vi.fn();
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeWebSocket.latest = this;
  }

  message(tokens: Array<{ text: string; is_final: boolean }>) {
    this.onmessage?.({ data: JSON.stringify({ tokens }) });
  }
}

afterEach(() => vi.unstubAllGlobals());

it("solo emite texto estable y segmentado por el fin de enunciado", () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const endpoint = vi.fn();
  const ready = vi.fn();
  const stream = sonioxSpeechProvider("fake-key")(48_000, { ready, endpoint, failed: vi.fn() });
  const ws = FakeWebSocket.latest;
  try {
    expect(ws.url).toBe("wss://stt-rt.soniox.com/transcribe-websocket");
    expect(ws.protocols).toEqual(["soniox-api-key", "fake-key"]);
    ws.onopen?.();
    expect(ready).toHaveBeenCalledOnce();
    expect(JSON.parse(ws.send.mock.calls[0]![0])).toMatchObject({
      audio_format: "pcm_s16le",
      language_hints: ["es"],
      enable_endpoint_detection: true,
    });
    ws.message([
      { text: "no se envía", is_final: false },
      { text: "Juego", is_final: true },
    ]);
    expect(endpoint).not.toHaveBeenCalled();
    ws.message([
      { text: " de tronos.", is_final: true },
      { text: "<end>", is_final: true },
    ]);
    ws.message([
      { text: "playa", is_final: true },
      { text: "<end>", is_final: true },
    ]);
    expect(endpoint.mock.calls).toEqual([["Juego de tronos."], ["playa"]]);
  } finally {
    stream.close();
  }
  ws.message([
    { text: "tardío", is_final: true },
    { text: "<end>", is_final: true },
  ]);
  expect(endpoint).toHaveBeenCalledTimes(2);
});
