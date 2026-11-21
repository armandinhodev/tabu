"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { VoiceStatus } from "@/infrastructure/socket/events";
import { Button } from "@/ui/components/ui/button";
import { getSocket } from "@/ui/lib/socket";

interface Capture {
  id: string;
  context: AudioContext;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  timeout?: ReturnType<typeof setTimeout>;
  requested?: boolean;
  epoch?: number;
  ready?: boolean;
  quiet?: boolean;
}

export function VoiceGuess({
  turnId,
  deadlineAt,
  clockOffsetMs,
}: {
  readonly turnId: string;
  readonly deadlineAt: number;
  readonly clockOffsetMs: number;
}) {
  const [phase, setPhase] = useState<"idle" | "starting" | "listening" | "rotating">("idle");
  const [message, setMessage] = useState("");
  const capture = useRef<Capture | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onStatus = (status: VoiceStatus) => {
      const current = capture.current;
      if (current?.id !== status.id) return;
      if (status.kind === "rotating" || status.kind === "ready") {
        if (current.epoch !== status.epoch) {
          current.epoch = status.epoch;
          current.quiet = status.epoch === 0;
        }
        current.ready = status.kind === "ready";
        clearTimeout(current.timeout);
        current.node?.port.postMessage({ epoch: status.epoch, ready: current.ready });
        setPhase(current.ready && current.quiet ? "listening" : "rotating");
      } else if (status.kind === "result") {
        if (status.guess.correct) {
          setMessage("");
          toast.success(
            status.guess.acceptedWithTypo ? "¡Acertaste! Corregimos la ortografía." : "¡Acertaste!",
          );
        } else {
          setMessage("No es esa. Probá de nuevo.");
        }
      } else if (status.kind === "invalid") {
        setMessage("La respuesta por voz es demasiado larga. Probá con una respuesta más breve.");
      } else {
        release();
        setPhase("idle");
        if (status.kind === "unavailable") setMessage("La voz no está disponible. Podés escribir.");
      }
    };
    const onDisconnect = () => {
      if (capture.current === null) return;
      release();
      setPhase("idle");
      setMessage("Se interrumpió el micrófono. Podés seguir escribiendo.");
    };
    socket.on("voice:status", onStatus);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("voice:status", onStatus);
      socket.off("disconnect", onDisconnect);
      release();
    };
  }, [turnId]);

  useEffect(() => {
    if (phase !== "starting") return;
    const timer = setTimeout(
      () => {
        // The server closes an established capture at its own deadline. The
        // fallback here only releases a pending browser permission prompt.
        if (capture.current?.requested !== false) return;
        release();
        setPhase("idle");
      },
      Math.max(0, deadlineAt - Date.now() - clockOffsetMs + 1_000),
    );
    return () => clearTimeout(timer);
  }, [deadlineAt, clockOffsetMs, phase]);

  function release(): void {
    const current = capture.current;
    if (current === null) return;
    capture.current = null;
    clearTimeout(current.timeout);
    current.stream?.getTracks().forEach((track) => track.stop());
    current.source?.disconnect();
    current.node?.port.close();
    current.node?.disconnect();
    void current.context.close().catch(() => {});
    const socket = getSocket();
    if (current.requested && socket.connected) socket.emit("voice:stop", current.id);
  }

  async function start(): Promise<void> {
    const socket = getSocket();
    if (capture.current !== null) return;
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === "undefined" ||
      typeof AudioWorkletNode === "undefined" ||
      !socket.connected ||
      socket.io.engine.transport.name !== "websocket"
    ) {
      setMessage("El micrófono no está disponible en esta conexión o navegador. Podés escribir.");
      return;
    }
    setMessage("");
    setPhase("starting");
    let started: Capture | undefined;
    try {
      const current: Capture = {
        id: crypto.randomUUID(),
        context: new AudioContext(),
        requested: false,
      };
      started = current;
      capture.current = current;
      const resumed = current.context.resume();
      const input = navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1 }, video: false })
        .then((stream) => {
          if (capture.current !== current) {
            stream.getTracks().forEach((track) => track.stop());
          } else {
            current.stream = stream;
          }
        });
      await Promise.all([
        resumed,
        input,
        current.context.audioWorklet.addModule("/voice-capture.js"),
      ]);
      if (capture.current !== current || current.stream === undefined) return;
      const source = current.context.createMediaStreamSource(current.stream);
      const node = new AudioWorkletNode(current.context, "tabu-voice-capture", {
        channelCount: 1,
        channelCountMode: "explicit",
      });
      current.node = node;
      current.source = source;
      node.port.onmessage = ({
        data,
      }: MessageEvent<{ epoch: number; audio: ArrayBuffer } | { epoch: number; quiet: true }>) => {
        if (capture.current !== current || current.epoch !== data.epoch) return;
        if ("quiet" in data) {
          current.quiet = true;
          if (current.ready) setPhase("listening");
        } else if (socket.connected) {
          socket.volatile.emit("voice:audio", current.id, data.epoch, data.audio);
        }
      };
      // The processor's output is silent; the graph needs a destination to run.
      source.connect(node);
      node.connect(current.context.destination);
      if (!socket.connected) throw new Error();
      current.requested = true;
      socket.emit("voice:start", {
        id: current.id,
        turnId,
        sampleRate: current.context.sampleRate,
      });
      current.timeout = setTimeout(() => {
        if (capture.current !== current) return;
        release();
        setPhase("idle");
        setMessage("No se pudo conectar la voz. Podés escribir.");
      }, 6_000);
    } catch {
      // A canceled request can reject later; don't change a newer capture's UI.
      if (started !== undefined && capture.current !== started) return;
      release();
      setPhase("idle");
      setMessage("No se pudo abrir el micrófono. Podés escribir.");
    }
  }

  const active = phase !== "idle";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm text-fg-muted">
        El audio se envía a Soniox para transcribir. La sala solo ve las respuestas enviadas.
      </p>
      <Button
        type="button"
        variant="quiet"
        onClick={() => {
          if (!active) {
            void start();
          } else {
            release();
            setPhase("idle");
            setMessage("");
          }
        }}
      >
        {active ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
        {active ? "Apagar micrófono" : "Activar micrófono"}
      </Button>
      <div role="status" className="text-body-sm text-fg-muted">
        {phase === "starting" ? "Conectando micrófono…" : null}
        {phase === "rotating"
          ? "Retomando el micrófono. Hacé una pausa breve antes de responder. "
          : null}
        {phase === "listening" ? "Micrófono activo. " : null}
        {message}
      </div>
    </div>
  );
}
