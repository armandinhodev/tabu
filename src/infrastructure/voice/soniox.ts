export interface SpeechStream {
  send(audio: Uint8Array): boolean;
  close(): void;
}

export type SpeechProvider = (
  sampleRate: number,
  callbacks: {
    ready(): void;
    endpoint(text: string | null): void;
    failed(): void;
  },
) => SpeechStream;

export function sonioxSpeechProvider(apiKey: string): SpeechProvider {
  return (sampleRate, callbacks) => {
    // Official browser-compatible WebSocket handshake; only this server sees the key.
    const socket = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket", [
      "soniox-api-key",
      apiKey,
    ]);
    let closed = false;
    let text = "";
    let overflow = false;
    const timeout = setTimeout(fail, 5_000);
    const keepalive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 64 * 1024) {
        socket.send('{"type":"keepalive"}');
      }
    }, 5_000);

    function close(): void {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      clearInterval(keepalive);
      text = "";
      socket.close();
    }

    function fail(): void {
      if (closed) return;
      close();
      callbacks.failed();
    }

    socket.onopen = () => {
      if (closed) return;
      clearTimeout(timeout);
      socket.send(
        JSON.stringify({
          model: "stt-rt-v6",
          audio_format: "pcm_s16le",
          sample_rate: sampleRate,
          num_channels: 1,
          language_hints: ["es"],
          enable_endpoint_detection: true,
          max_endpoint_delay_ms: 1_000,
        }),
      );
      callbacks.ready();
    };
    socket.onerror = fail;
    socket.onclose = fail;
    socket.onmessage = ({ data }) => {
      if (closed || typeof data !== "string") return;
      try {
        const response = JSON.parse(data);
        if (response.error_code || response.finished) {
          fail();
          return;
        }
        if (!Array.isArray(response.tokens)) return;
        for (const token of response.tokens) {
          if (closed) break;
          if (token?.is_final !== true || typeof token.text !== "string") continue;
          if (token.text === "<end>") {
            const final = overflow ? null : text;
            text = "";
            overflow = false;
            callbacks.endpoint(final);
          } else if (token.text !== "<fin>" && !overflow) {
            if (text.length + token.text.length > 512) {
              text = "";
              overflow = true;
            } else {
              text += token.text;
            }
          }
        }
      } catch {
        fail();
      }
    };
    return {
      send(audio) {
        if (closed || socket.readyState !== WebSocket.OPEN) return false;
        if (socket.bufferedAmount >= 64 * 1024) return false;
        socket.send(Uint8Array.from(audio));
        return true;
      },
      close,
    };
  };
}
