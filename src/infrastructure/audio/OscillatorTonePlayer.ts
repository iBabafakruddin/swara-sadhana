import type { PlaybackHandle, TonePlayer } from '@/application/ports';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import type { TimeRange } from '@/domain/comparison/compareTakes';

const MELODY_GAIN = 0.18;
const CLICK_GAIN = 0.3;
/** Smooths note starts and ends so the tone doesn't click. */
const FADE_SEC = 0.015;
const START_DELAY_SEC = 0.05;

/** Plays guide melodies and count-ins with Web Audio oscillators; nothing is downloaded. */
export class OscillatorTonePlayer implements TonePlayer {
  private context: AudioContext | null = null;

  playMelody(track: PitchTrack, range: TimeRange, rate: number): PlaybackHandle {
    const context = this.getContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    // A triangle wave is soft but still has enough overtones to hear the pitch clearly.
    oscillator.type = 'triangle';
    gain.gain.value = 0;
    oscillator.connect(gain).connect(context.destination);

    const start = context.currentTime + START_DELAY_SEC;
    const at = (timeSec: number) => start + (timeSec - range.startSec) / rate;
    let wasVoiced = false;
    for (const point of track) {
      if (point.timeSec < range.startSec || point.timeSec >= range.endSec) continue;
      const voiced = point.frequencyHz !== null;
      if (voiced) {
        // Glide between neighbouring points, but jump straight to the first note after a gap.
        if (wasVoiced) oscillator.frequency.linearRampToValueAtTime(point.frequencyHz!, at(point.timeSec));
        else oscillator.frequency.setValueAtTime(point.frequencyHz!, at(point.timeSec));
      }
      if (voiced !== wasVoiced) gain.gain.setTargetAtTime(voiced ? MELODY_GAIN : 0, at(point.timeSec), FADE_SEC);
      wasVoiced = voiced;
    }
    const end = at(range.endSec);
    gain.gain.setTargetAtTime(0, end, FADE_SEC);
    oscillator.start(start);
    oscillator.stop(end + 5 * FADE_SEC);
    return handleFor(oscillator);
  }

  countIn(beats: number, intervalSec: number): PlaybackHandle {
    const context = this.getContext();
    const start = context.currentTime + START_DELAY_SEC;
    const clicks: OscillatorNode[] = [];
    for (let beat = 0; beat < beats; beat++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const time = start + beat * intervalSec;
      // The last click is higher, as a "go" signal.
      oscillator.frequency.value = beat === beats - 1 ? 1320 : 880;
      gain.gain.setValueAtTime(CLICK_GAIN, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.1);
      clicks.push(oscillator);
    }
    const handle = handleFor(clicks[clicks.length - 1]);
    return {
      stop: () => {
        for (const click of clicks) click.stop();
        handle.stop();
      },
      done: handle.done,
    };
  }

  private getContext(): AudioContext {
    this.context ??= new AudioContext();
    // Browsers start audio contexts suspended until a user gesture; play calls come from one.
    void this.context.resume();
    return this.context;
  }
}

function handleFor(node: OscillatorNode): PlaybackHandle {
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  node.onended = () => finish();
  return {
    stop: () => {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
      finish();
    },
    done,
  };
}
