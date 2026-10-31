import { describe, expect, it } from 'vitest';
import { analyzePitchTrack, detectPitch, type PitchTrackOptions } from './pitchDetection';

const SAMPLE_RATE = 16_000;
const OPTIONS: PitchTrackOptions = {
  frameSize: 1024,
  hopSize: 1600,
  minFrequencyHz: 70,
  maxFrequencyHz: 1100,
  threshold: 0.15,
  silenceRms: 0.01,
};

function sine(frequencyHz: number, seconds: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / SAMPLE_RATE);
  }
  return samples;
}

describe('detectPitch', () => {
  it.each([110, 220, 440, 880])('finds %d Hz in a pure tone', (frequency) => {
    const detected = detectPitch(sine(frequency, 0.064), SAMPLE_RATE, OPTIONS);
    expect(detected).not.toBeNull();
    expect(Math.abs(detected! - frequency) / frequency).toBeLessThan(0.01);
  });

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(1024), SAMPLE_RATE, OPTIONS)).toBeNull();
  });
});

describe('analyzePitchTrack', () => {
  it('reports voiced frames during the tone and nulls during the silence after it', () => {
    const tone = sine(330, 1);
    const samples = new Float32Array(tone.length + SAMPLE_RATE / 2);
    samples.set(tone);

    const track = analyzePitchTrack(samples, SAMPLE_RATE, OPTIONS);
    const during = track.filter((p) => p.timeSec < 0.9);
    const after = track.filter((p) => p.timeSec > 1.1);

    expect(during.length).toBeGreaterThan(0);
    for (const point of during) expect(point.frequencyHz).toBeCloseTo(330, -1);
    for (const point of after) expect(point.frequencyHz).toBeNull();
  });
});
