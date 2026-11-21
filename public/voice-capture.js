/* Runs on the audio rendering thread. No audio is saved or played back. */
class TabuVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.epoch = null;
    this.size = Math.ceil(sampleRate / 25);
    this.frame = new ArrayBuffer(this.size * 2);
    this.view = new DataView(this.frame);
    this.offset = 0;
    this.awaitQuiet = false;
    this.quietSamples = 0;
    this.steadySamples = 0;
    this.steadyEnergy = 0;
    this.ready = false;
    this.port.onmessage = ({ data }) => {
      if (data.epoch !== this.epoch) {
        this.epoch = data.epoch;
        this.offset = 0;
        this.awaitQuiet = data.epoch > 0;
        this.quietSamples = 0;
        this.steadySamples = 0;
        this.steadyEnergy = 0;
      }
      this.ready = data.ready;
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || this.epoch === null) return true;
    // Don't send the tail of an utterance that continued across a card change.
    if (this.awaitQuiet) {
      let energy = 0;
      for (const sample of channel) energy += sample * sample;
      energy /= channel.length;
      // Allow low, steady background noise without mistaking variable speech
      // for a pause. Loud background still requires a real pause or keyboard.
      if (Math.abs(energy - this.steadyEnergy) <= this.steadyEnergy * 0.25 + 0.000005) {
        this.steadySamples += channel.length;
      } else {
        this.steadyEnergy = energy;
        this.steadySamples = 0;
      }
      const quiet = energy < 0.0001 || (energy < 0.0016 && this.steadySamples >= sampleRate * 0.15);
      this.quietSamples = quiet ? this.quietSamples + channel.length : 0;
      if (this.ready && this.quietSamples >= sampleRate * 0.25) {
        this.awaitQuiet = false;
        this.port.postMessage({ epoch: this.epoch, quiet: true });
      }
      return true;
    }
    if (!this.ready) return true;
    for (const sample of channel) {
      this.view.setInt16(this.offset * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
      if (++this.offset === this.size) {
        this.port.postMessage({ epoch: this.epoch, audio: this.frame }, [this.frame]);
        this.frame = new ArrayBuffer(this.size * 2);
        this.view = new DataView(this.frame);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("tabu-voice-capture", TabuVoiceCapture);
