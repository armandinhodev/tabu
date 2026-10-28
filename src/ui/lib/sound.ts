"use client";

/**
 * Lightweight Web Audio cues: soft harmonic voices, short envelopes and a
 * filtered, gently compressed mix. No audio assets or runtime dependencies.
 * Gesture unlock, master volume and persisted mute retain their existing API.
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
  gain = 0.22,
  endFrequency = frequency,
): void {
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.012, duration * 0.12));
  envelope.gain.exponentialRampToValueAtTime(gain * 0.34, start + Math.min(0.06, duration * 0.4));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  envelope.gain.linearRampToValueAtTime(0, start + duration + 0.012);
  envelope.connect(out);

  // Quiet, slightly inharmonic overtones give each note a rounded mallet timbre.
  const partials = [
    [1, 0.76],
    [2.003, 0.18],
    [3.997, 0.06],
  ] as const;
  const audible = partials.filter(
    ([ratio]) => Math.max(frequency, endFrequency) * ratio < context.sampleRate * 0.45,
  );
  let remaining = audible.length;

  for (const [ratio, level] of audible) {
    const oscillator = context.createOscillator();
    const partial = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * ratio, start);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency * ratio, start + duration);
    }
    partial.gain.value = level;
    oscillator.connect(partial);
    partial.connect(envelope);
    oscillator.onended = () => {
      oscillator.disconnect();
      partial.disconnect();
      if (--remaining === 0) envelope.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.016);
  }
}

function noise(context: AudioContext, out: GainNode, start: number, duration: number): void {
  const frames = Math.ceil(context.sampleRate * (duration + 0.02));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frames; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1_900, start);
  filter.frequency.exponentialRampToValueAtTime(650, start + duration);
  filter.Q.value = 0.65;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(0.07, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  envelope.gain.linearRampToValueAtTime(0, start + duration + 0.012);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(out);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    envelope.disconnect();
  };
  source.start(start);
  source.stop(start + duration + 0.016);
}

const SOUNDS: Record<SoundName, Voice> = {
  "ui.click": (context, out, start) => {
    tone(context, out, start, 760, 0.04, 0.1);
  },
  "player.join": (context, out, start) => {
    tone(context, out, start, 523.25, 0.13, 0.16);
    tone(context, out, start + 0.075, 659.25, 0.16, 0.18);
  },
  "game.start": (context, out, start) => {
    [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
      tone(context, out, start + index * 0.085, frequency, 0.19, 0.22);
    });
  },
  "turn.start": (context, out, start) => {
    tone(context, out, start, 523.25, 0.13, 0.16);
    tone(context, out, start + 0.085, 783.99, 0.18, 0.2);
  },
  "turn.tick": (context, out, start) => {
    tone(context, out, start, 990, 0.045, 0.08);
  },
  "correct.guess": (context, out, start) => {
    [659.25, 783.99, 1_046.5].forEach((frequency, index) => {
      tone(context, out, start + index * 0.075, frequency, 0.18, 0.22);
    });
  },
  "taboo.hit": (context, out, start) => {
    tone(context, out, start, 220, 0.23, 0.21, 174.61);
    tone(context, out, start + 0.085, 146.83, 0.2, 0.17, 130.81);
  },
  "turn.skip": (context, out, start) => {
    noise(context, out, start, 0.14);
    tone(context, out, start + 0.04, 392, 0.12, 0.14, 329.63);
  },
  "score.change": (context, out, start) => {
    tone(context, out, start, 783.99, 0.09, 0.12);
    tone(context, out, start + 0.06, 1_046.5, 0.12, 0.14);
  },
  "round.end": (context, out, start) => {
    [392, 493.88, 587.33].forEach((frequency, index) => {
      tone(context, out, start + index * 0.1, frequency, 0.22, 0.2);
    });
  },
  "game.over": (context, out, start) => {
    [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
      tone(context, out, start + index * 0.11, frequency, 0.26, 0.23);
    });
  },
  error: (context, out, start) => {
    tone(context, out, start, 293.66, 0.1, 0.16);
    tone(context, out, start + 0.09, 261.63, 0.13, 0.14);
  },
  reconnect: (context, out, start) => {
    tone(context, out, start, 440, 0.12, 0.14);
    tone(context, out, start + 0.09, 554.37, 0.15, 0.16);
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
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(6_800, context.sampleRate * 0.45);
    filter.Q.value = 0.5;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.08;
    const reflection = context.createDelay(0.1);
    reflection.delayTime.value = 0.045;
    const wet = context.createGain();
    wet.gain.value = 0.08;
    master.connect(filter);
    filter.connect(compressor);
    filter.connect(reflection);
    reflection.connect(wet);
    wet.connect(compressor);
    compressor.connect(context.destination);
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
