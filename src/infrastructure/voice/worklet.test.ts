/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("rechaza audio de una carta anterior y retoma al detectar ruido ambiente estable", () => {
  type Frame = { epoch: number; audio?: ArrayBuffer; quiet?: true };
  type Processor = {
    port: { onmessage: (message: { data: { epoch: number; ready: boolean } }) => void };
    process: (inputs: Float32Array[][]) => void;
  };
  const frames: Frame[] = [];
  let Worklet!: new () => Processor;
  runInNewContext(readFileSync("public/voice-capture.js", "utf8"), {
    sampleRate: 16_000,
    AudioWorkletProcessor: class {
      port = { postMessage: (message: Frame) => frames.push(message) };
    },
    registerProcessor: (_name: string, worklet: typeof Worklet) => {
      Worklet = worklet;
    },
  });
  const worklet = new Worklet();
  const send = (sample: number) => worklet.process([[new Float32Array(640).fill(sample)]]);
  send(0.5);
  expect(frames).toEqual([]);
  worklet.port.onmessage({ data: { epoch: 0, ready: true } });
  send(0.5);
  expect(Buffer.from(frames[0]!.audio!).readInt16LE()).toBe(16383);
  worklet.port.onmessage({ data: { epoch: 1, ready: false } });
  for (let index = 0; index < 12; index++) send(0.02);
  expect(frames).toHaveLength(1);
  worklet.port.onmessage({ data: { epoch: 1, ready: true } });
  for (let index = 0; index < 12; index++) send(index % 2 === 0 ? 0.15 : 0.6);
  expect(frames).toHaveLength(1);
  for (let index = 0; index < 12; index++) send(0.02);
  expect(frames[1]).toEqual({ epoch: 1, quiet: true });
  expect(frames[2]).toMatchObject({ epoch: 1, audio: expect.anything() });
});
