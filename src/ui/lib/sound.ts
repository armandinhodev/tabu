"use client";

/**
 * Sonido sintetizado con Web Audio (§8): sin archivos, sin bundle extra.
 * El contexto nace suspendido y se reanuda con el primer gesto del usuario
 * (requisito de iOS/Safari). Volumen maestro 0.5 y mute persistido.
 */

export type SoundName =
  | "ui.click"
  | "player.join"
  | "game.start"
  | "turn.start"
  | "turn.tick"
  | "correct.guess"
  | "taboo.hit"
  | "turn.skip"
  | "score.change"
  | "round.end"
  | "game.over"
  | "error"
  | "reconnect";

const MASTER_VOLUME = 0.5;
const MUTE_KEY = "tabu:muted";

type Voice = (context: AudioContext, out: GainNode, start: number) => void;

function tone(
  context: AudioContext,
  out: GainNode,
  start: number,
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.6,
): void {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function slide(
  context: AudioContext,
  out: GainNode,
  start: number,
  from: number,
  to: number,
  duration: number,
): void {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(0.5, start + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(context: AudioContext, out: GainNode, start: number, duration: number): void {
  const frames = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frames; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
  }

  const source = context.createBufferSource();
  const envelope = context.createGain();

  source.buffer = buffer;
  envelope.gain.value = 0.25;
  source.connect(envelope);
  envelope.connect(out);
  source.start(start);
}

const SOUNDS: Record<SoundName, Voice> = {
  "ui.click": (context, out, start) => {
    tone(context, out, start, 1_200, 0.04, "sine", 0.35);
  },
  "player.join": (context, out, start) => {
    tone(context, out, start, 523.25, 0.07, "triangle", 0.4);
    tone(context, out, start + 0.07, 659.25, 0.07, "triangle", 0.4);
  },
  "game.start": (context, out, start) => {
    [523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) => {
      tone(context, out, start + index * 0.09, frequency, 0.12, "triangle", 0.4);
    });
  },
  "turn.start": (context, out, start) => {
    tone(context, out, start, 880, 0.06, "square", 0.3);
    tone(context, out, start + 0.08, 1_320, 0.04, "sine", 0.3);
  },
  "turn.tick": (context, out, start) => {
    tone(context, out, start, 1_500, 0.03, "square", 0.22);
  },
  "correct.guess": (context, out, start) => {
    [659.25, 783.99, 1_046.5].forEach((frequency, index) => {
      tone(context, out, start + index * 0.08, frequency, 0.14, "triangle", 0.42);
    });
  },
  "taboo.hit": (context, out, start) => {
    slide(context, out, start, 220, 110, 0.36);
    noise(context, out, start, 0.18);
  },
  "turn.skip": (context, out, start) => {
    tone(context, out, start, 392, 0.09, "triangle", 0.35);
    tone(context, out, start + 0.09, 294, 0.1, "triangle", 0.35);
  },
  "score.change": (context, out, start) => {
    tone(context, out, start, 988, 0.06, "square", 0.28);
    tone(context, out, start + 0.06, 1_318, 0.08, "square", 0.28);
  },
  "round.end": (context, out, start) => {
    [523.25, 659.25, 880].forEach((frequency, index) => {
      tone(context, out, start + index * 0.14, frequency, 0.2, "triangle", 0.4);
    });
  },
  "game.over": (context, out, start) => {
    [523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) => {
      tone(context, out, start + index * 0.15, frequency, 0.24, "triangle", 0.44);
    });
  },
  error: (context, out, start) => {
    tone(context, out, start, 196, 0.05, "sawtooth", 0.32);
    tone(context, out, start + 0.06, 165, 0.05, "sawtooth", 0.32);
  },
  reconnect: (context, out, start) => {
    tone(context, out, start, 440, 0.08, "sine", 0.32);
    tone(context, out, start + 0.09, 554, 0.08, "sine", 0.32);
  },
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let busyUntil = 0;

function readMuted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

let muted = readMuted();
const listeners = new Set<(value: boolean) => void>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;

  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // sin storage el mute dura la sesión
  }

  for (const listener of listeners) {
    listener(value);
  }
}

export function subscribeMuted(listener: (value: boolean) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Primer gesto: habilita el audio del navegador. */
export function unlockAudio(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (context === null) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (Ctor === undefined) {
      return;
    }

    context = new Ctor();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
  }

  if (context.state === "suspended") {
    void context.resume();
  }
}

/** Un solo sonido por vez y nunca más de 700 ms (§8). */
export function playSound(name: SoundName): void {
  if (muted || context === null || master === null) {
    return;
  }

  const now = context.currentTime;

  if (now < busyUntil) {
    return;
  }

  const voice = SOUNDS[name];
  voice(context, master, now + 0.01);
  busyUntil = now + 0.72;
}
