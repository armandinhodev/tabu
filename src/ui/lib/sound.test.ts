import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function parameter(value = 0) {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function node() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function makeAudio() {
  const gains: Array<ReturnType<typeof node> & { gain: ReturnType<typeof parameter> }> = [];
  const oscillators: Array<
    ReturnType<typeof node> & {
      type: OscillatorType;
      frequency: ReturnType<typeof parameter>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
    }
  > = [];
  const sources: Array<
    ReturnType<typeof node> & {
      buffer: unknown;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
    }
  > = [];
  const audio = {
    currentTime: 1,
    state: "running",
    sampleRate: 48_000,
    destination: node(),
    gains,
    oscillators,
    sources,
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => {
      const gain = { ...node(), gain: parameter() };
      gains.push(gain);
      return gain;
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        ...node(),
        type: "sine" as OscillatorType,
        frequency: parameter(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createBiquadFilter: vi.fn(() => ({
      ...node(),
      type: "lowpass",
      frequency: parameter(),
      Q: parameter(),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      ...node(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
    })),
    createDelay: vi.fn(() => ({ ...node(), delayTime: parameter() })),
    createBuffer: vi.fn((_channels: number, frames: number) => {
      const data = new Float32Array(frames);
      return { getChannelData: () => data };
    }),
    createBufferSource: vi.fn(() => {
      const source = {
        ...node(),
        buffer: null as unknown,
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      sources.push(source);
      return source;
    }),
  };
  return audio;
}

let audio: ReturnType<typeof makeAudio>;
let sound: typeof import("./sound");
let AudioConstructor: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  audio = makeAudio();
  AudioConstructor = vi.fn(function () {
    return audio;
  });
  vi.stubGlobal("AudioContext", AudioConstructor);
  sound = await import("./sound");
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("sound mix", () => {
  it("uses a filtered, compressed output and a subtle short room reflection", () => {
    sound.unlockAudio();
    expect(audio.gains[0]?.gain.value).toBe(0.5);
    expect(audio.createBiquadFilter).toHaveBeenCalled();
    expect(audio.createDynamicsCompressor).toHaveBeenCalledOnce();
    expect(audio.createDelay).toHaveBeenCalledOnce();
    const delay = audio.createDelay.mock.results[0]!.value;
    expect(delay.delayTime.value).toBeGreaterThan(0);
    expect(delay.delayTime.value).toBeLessThanOrEqual(0.06);
  });

  it.each([
    "ui.click",
    "player.join",
    "game.start",
    "turn.start",
    "turn.tick",
    "correct.guess",
    "taboo.hit",
    "turn.skip",
    "score.change",
    "round.end",
    "game.over",
    "error",
    "reconnect",
  ] as const)("gives %s soft envelopes, bounded duration and complete node cleanup", (name) => {
    sound.unlockAudio();
    sound.playSound(name);
    const voices = [...audio.oscillators, ...audio.sources];
    expect(voices.length).toBeGreaterThan(0);
    expect(
      audio.oscillators.every(
        (oscillator) => oscillator.type === "sine" || oscillator.type === "triangle",
      ),
    ).toBe(true);
    const envelopes = audio.gains.filter((gain) => gain.gain.setValueAtTime.mock.calls.length > 0);
    expect(envelopes.length).toBeGreaterThan(0);
    for (const envelope of envelopes) {
      expect(envelope.gain.setValueAtTime.mock.calls[0]?.[0]).toBe(0);
      expect(envelope.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
      for (const [gain] of [
        ...envelope.gain.linearRampToValueAtTime.mock.calls,
        ...envelope.gain.exponentialRampToValueAtTime.mock.calls,
      ]) {
        expect(gain).toBeGreaterThanOrEqual(0);
        expect(gain).toBeLessThanOrEqual(0.3);
      }
    }
    for (const voice of voices) {
      expect(voice.start.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(audio.currentTime);
      // Include the room reflection in the maximum audible duration.
      expect(voice.stop.mock.calls[0]?.[0] + 0.045 - audio.currentTime).toBeLessThanOrEqual(0.7);
      voice.onended?.();
      expect(voice.disconnect).toHaveBeenCalledOnce();
    }
    for (const gain of audio.gains.slice(2)) expect(gain.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps mute persistence, notifications and the silent playback guard", () => {
    const listener = vi.fn();
    const unsubscribe = sound.subscribeMuted(listener);
    sound.setMuted(true);
    sound.unlockAudio();
    sound.playSound("correct.guess");
    expect(audio.oscillators).toHaveLength(0);
    expect(localStorage.getItem("tabu:muted")).toBe("1");
    expect(sound.isMuted()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
    sound.setMuted(false);
    expect(localStorage.getItem("tabu:muted")).toBe("0");
    expect(listener).toHaveBeenCalledTimes(1);
    sound.playSound("correct.guess");
    expect(audio.oscillators.length).toBeGreaterThan(0);
  });

  it("preserves gesture unlock, context reuse and the existing overlap guard", () => {
    sound.playSound("ui.click");
    expect(AudioConstructor).not.toHaveBeenCalled();
    audio.state = "suspended";
    sound.unlockAudio();
    sound.unlockAudio();
    expect(AudioConstructor).toHaveBeenCalledOnce();
    expect(audio.resume).toHaveBeenCalled();
    sound.playSound("ui.click");
    const first = audio.oscillators.length;
    sound.playSound("error");
    expect(audio.oscillators).toHaveLength(first);
    audio.currentTime += 0.73;
    sound.playSound("error");
    expect(audio.oscillators.length).toBeGreaterThan(first);
  });

  it("remains safe without browser audio support", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(() => {
      sound.unlockAudio();
      sound.playSound("ui.click");
    }).not.toThrow();
    expect(audio.oscillators).toHaveLength(0);
  });

  it("preserves the Safari audio constructor fallback", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", AudioConstructor);
    sound.unlockAudio();
    sound.playSound("player.join");
    expect(AudioConstructor).toHaveBeenCalledOnce();
    expect(audio.oscillators.length).toBeGreaterThan(0);
  });
});
