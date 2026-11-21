import type { Turn } from "../../domain/entities/Turn";
import type { GuessAck, VoiceStatus } from "../socket/events";
import type { SpeechProvider, SpeechStream } from "./soniox";

interface VoiceTurn {
  readonly gameId: string;
  readonly turn: Turn;
}

interface Capture {
  readonly id: string;
  readonly gameId: string;
  readonly turnId: string;
  readonly sampleRate: number;
  readonly deadline: ReturnType<typeof setTimeout>;
  card: Turn["card"];
  epoch: number;
  ready: boolean;
  stream?: SpeechStream;
  rotation?: ReturnType<typeof setTimeout>;
  audioWindow: number;
  audioBytes: number;
}

export class VoiceCaptures {
  private readonly captures = new Map<string, Capture>();
  private readonly lastStart = new Map<string, number>();

  constructor(
    private readonly provider: SpeechProvider,
    private readonly current: (socketId: string) => VoiceTurn | null,
    private readonly notify: (socketId: string, message: VoiceStatus) => void,
    private readonly guess: (
      socketId: string,
      text: string,
      reply: (result: GuessAck) => void,
    ) => void,
    private readonly now: () => number,
  ) {}

  start(socketId: string, payload: unknown): void {
    if (typeof payload !== "object" || payload === null) return;
    const { id, turnId, sampleRate } = payload as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) return;
    const current = this.current(socketId);
    const now = this.now();
    if (
      current === null ||
      current.turn.id !== turnId ||
      typeof sampleRate !== "number" ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8_000 ||
      sampleRate > 96_000 ||
      this.captures.has(socketId) ||
      this.captures.size >= 24 ||
      now - (this.lastStart.get(socketId) ?? -Infinity) < 1_000
    ) {
      this.notify(socketId, { id, kind: "unavailable" });
      return;
    }
    this.lastStart.set(socketId, now);
    const deadline = setTimeout(
      () => this.stop(socketId),
      Math.max(0, current.turn.deadlineAt.getTime() - now),
    );
    deadline.unref?.();
    const capture: Capture = {
      id,
      gameId: current.gameId,
      turnId: current.turn.id,
      card: current.turn.card,
      sampleRate,
      deadline,
      epoch: 0,
      ready: false,
      audioWindow: now,
      audioBytes: 0,
    };
    this.captures.set(socketId, capture);
    this.open(socketId, capture);
  }

  audio(socketId: string, id: unknown, epoch: unknown, audio: unknown): void {
    const capture = this.captures.get(socketId);
    if (!capture || capture.id !== id || capture.epoch !== epoch || !capture.ready) return;
    if (!this.validate(socketId, capture)) return;
    if (
      !Buffer.isBuffer(audio) ||
      audio.length === 0 ||
      audio.length % 2 !== 0 ||
      audio.length > Math.ceil(capture.sampleRate / 25) * 2
    )
      return;
    const now = this.now();
    if (now - capture.audioWindow >= 1_000) {
      capture.audioWindow = now;
      capture.audioBytes = 0;
    }
    capture.audioBytes += audio.length;
    if (capture.audioBytes > capture.sampleRate * 3) {
      this.stop(socketId, "unavailable");
      return;
    }
    try {
      if (!capture.stream?.send(audio)) this.stop(socketId, "unavailable");
    } catch {
      this.stop(socketId, "unavailable");
    }
  }

  sync(gameId: string): void {
    for (const [socketId, capture] of this.captures) {
      if (capture.gameId === gameId) this.validate(socketId, capture);
    }
  }

  cancel(socketId: string, id: unknown): void {
    if (this.captures.get(socketId)?.id === id) this.stop(socketId);
  }

  forget(socketId: string): void {
    this.stop(socketId);
    this.lastStart.delete(socketId);
  }

  close(): void {
    for (const socketId of this.captures.keys()) this.stop(socketId);
    this.lastStart.clear();
  }

  private stop(socketId: string, kind: "closed" | "unavailable" = "closed"): void {
    const capture = this.captures.get(socketId);
    if (!capture) return;
    this.captures.delete(socketId);
    clearTimeout(capture.deadline);
    clearTimeout(capture.rotation);
    capture.stream?.close();
    this.notify(socketId, { id: capture.id, kind });
  }

  private validate(socketId: string, capture: Capture): boolean {
    const current = this.current(socketId);
    if (
      current === null ||
      current.gameId !== capture.gameId ||
      current.turn.id !== capture.turnId
    ) {
      this.stop(socketId);
      return false;
    }
    // Each draw creates a new card object, even when the points deck repeats a card.
    if (capture.card !== current.turn.card) {
      capture.card = current.turn.card;
      capture.epoch++;
      capture.ready = false;
      capture.stream?.close();
      delete capture.stream;
      clearTimeout(capture.rotation);
      this.notify(socketId, { id: capture.id, kind: "rotating", epoch: capture.epoch });
      capture.rotation = setTimeout(() => {
        if (this.validate(socketId, capture)) this.open(socketId, capture);
      }, 150);
      capture.rotation.unref?.();
      return false;
    }
    return true;
  }

  private open(socketId: string, capture: Capture): void {
    const epoch = capture.epoch;
    const live = () => this.captures.get(socketId) === capture && capture.epoch === epoch;
    try {
      capture.stream = this.provider(capture.sampleRate, {
        ready: () => {
          if (!live() || !this.validate(socketId, capture)) return;
          capture.ready = true;
          this.notify(socketId, { id: capture.id, kind: "ready", epoch });
        },
        endpoint: (text) => {
          if (!live() || !capture.ready || !this.validate(socketId, capture)) return;
          const guess = text
            ?.trim()
            .replace(/[.!?…]+$/u, "")
            .replace(/^[¿¡]+/u, "")
            .trim();
          if (guess === "") return;
          if (guess === undefined || guess.length > 80) {
            this.notify(socketId, { id: capture.id, kind: "invalid" });
            return;
          }
          try {
            this.guess(socketId, guess, (result) =>
              this.notify(socketId, { id: capture.id, kind: "result", guess: result }),
            );
          } catch {
            this.stop(socketId, "unavailable");
          }
        },
        failed: () => {
          if (live()) this.stop(socketId, "unavailable");
        },
      });
      if (!live()) capture.stream.close();
    } catch {
      if (live()) this.stop(socketId, "unavailable");
    }
  }
}
