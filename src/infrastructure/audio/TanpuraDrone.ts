import type { DroneFirstString, DronePlayer } from '@/application/ports';

/** First string as a ratio of Sa, in the octave below (just intonation, as a tanpura is tuned). */
const FIRST_STRING_RATIO: Record<DroneFirstString, number> = {
  pa: 3 / 4,
  ma: 2 / 3,
  ni: 15 / 16,
};

// A tanpura's cycle: first string, two middle Sa strings, low Sa, then a short rest.
const PLUCK_GAP_SEC = 0.6;
const CYCLE_SEC = 2.8;
const RING_SEC = 3.4;
const PLUCK_GAIN = 0.09;
const DETUNE_CENTS = 4;
const LOOKAHEAD_SEC = 1;
const SCHEDULER_MS = 200;

/**
 * Synthesises a tanpura drone with Web Audio: each pluck is a pair of slightly detuned sawtooth
 * oscillators through a closing low-pass filter, which gives the bright attack and warm ring.
 * Plucks are scheduled a little ahead on a timer so timing stays steady.
 */
export class TanpuraDrone implements DronePlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private nextCycleAt = 0;
  private strings: number[] = [];
  private volume = 0.7;

  start(tonicHz: number, firstString: DroneFirstString): void {
    this.stop();
    this.context ??= new AudioContext();
    void this.context.resume();
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(context.destination);
    this.strings = [tonicHz * FIRST_STRING_RATIO[firstString], tonicHz, tonicHz, tonicHz / 2];
    this.nextCycleAt = context.currentTime + 0.05;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_MS);
  }

  stop(): void {
    window.clearInterval(this.timer);
    const master = this.master;
    const context = this.context;
    this.master = null;
    if (!master || !context) return;
    // Fade out rather than cut, then drop the node so ringing plucks fall silent.
    master.gain.setTargetAtTime(0, context.currentTime, 0.15);
    window.setTimeout(() => master.disconnect(), 800);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master && this.context) this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.05);
  }

  private schedule(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    while (this.nextCycleAt < context.currentTime + LOOKAHEAD_SEC) {
      this.strings.forEach((frequency, k) => this.pluck(context, master, frequency, this.nextCycleAt + k * PLUCK_GAP_SEC));
      this.nextCycleAt += CYCLE_SEC;
    }
  }

  private pluck(context: AudioContext, destination: AudioNode, frequency: number, at: number): void {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(frequency * 14, at);
    filter.frequency.exponentialRampToValueAtTime(frequency * 3, at + RING_SEC * 0.6);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(PLUCK_GAIN, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + RING_SEC);
    filter.connect(gain).connect(destination);

    for (const detune of [-DETUNE_CENTS, DETUNE_CENTS]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(filter);
      oscillator.start(at);
      oscillator.stop(at + RING_SEC + 0.05);
    }
  }
}
