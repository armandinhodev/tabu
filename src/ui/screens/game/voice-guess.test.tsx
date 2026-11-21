import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GuessChat } from "./guess-chat";
import { VoiceGuess } from "./voice-guess";

const { socket, toastSuccess } = vi.hoisted(() => ({
  socket: {
    connected: true,
    io: { engine: { transport: { name: "websocket" } } },
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  toastSuccess: vi.fn(),
}));
vi.mock("@/ui/lib/socket", () => ({ getSocket: () => socket }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

function browser(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 48_000;
      audioWorklet = { addModule: async () => {} };
      resume = async () => {};
      close = async () => {};
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { close: vi.fn(), postMessage: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("no pide permiso sin gesto y detiene un permiso tardío tras desmontar", async () => {
  let resolve!: (stream: unknown) => void;
  const getUserMedia = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const stop = vi.fn();
  browser(getUserMedia);
  const { unmount } = render(
    <VoiceGuess turnId="turn" deadlineAt={Date.now() + 60_000} clockOffsetMs={0} />,
  );
  expect(getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Activar micrófono" }));
  expect(getUserMedia).toHaveBeenCalledOnce();
  unmount();
  await act(async () => {
    resolve({ getTracks: () => [{ stop }] });
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(socket.emit).not.toHaveBeenCalled();
});

it("permite enviar por teclado mientras se escucha y apaga al desconectar", async () => {
  const stop = vi.fn();
  const onGuess = vi.fn();
  browser(async () => ({ getTracks: () => [{ stop }] }));
  render(
    <GuessChat
      active
      messages={[]}
      onGuess={onGuess}
      voice={<VoiceGuess turnId="turn" deadlineAt={Date.now() + 60_000} clockOffsetMs={0} />}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Activar micrófono" }));
  await waitFor(() => expect(socket.emit).toHaveBeenCalledWith("voice:start", expect.anything()));
  const id = socket.emit.mock.calls[0]![1].id;
  const status = socket.on.mock.calls.find(([name]) => name === "voice:status")![1];
  act(() => status({ id, kind: "ready", epoch: 0 }));
  expect(screen.getByRole("status")).toHaveTextContent("Micrófono activo");
  const input = screen.getByRole("textbox", { name: "Tu respuesta" });
  fireEvent.change(input, { target: { value: "arena" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onGuess).toHaveBeenCalledWith("arena");
  expect(stop).not.toHaveBeenCalled();
  act(() => status({ id, kind: "result", guess: { correct: true } }));
  expect(toastSuccess).toHaveBeenCalledWith("¡Acertaste!");
  act(() => status({ id, kind: "rotating", epoch: 1 }));
  act(() => status({ id, kind: "ready", epoch: 1 }));
  expect(screen.getByRole("status")).toHaveTextContent("Retomando el micrófono");
  expect(stop).not.toHaveBeenCalled();
  const disconnect = socket.on.mock.calls.find(([name]) => name === "disconnect")![1];
  act(disconnect);
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Activar micrófono" })).toBeVisible();
});
