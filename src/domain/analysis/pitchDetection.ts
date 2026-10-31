export interface PitchPoint {
  timeSec: number;
  /** null when the frame is silent or unvoiced. */
  frequencyHz: number | null;
}

export type PitchTrack = PitchPoint[];

export interface PitchDetectionOptions {
  minFrequencyHz: number;
  maxFrequencyHz: number;
  /** YIN aperiodicity threshold; lower is stricter. */
  threshold: number;
  /** Frames quieter than this RMS are treated as silence. */
  silenceRms: number;
}

export interface PitchTrackOptions extends PitchDetectionOptions {
  frameSize: number;
  hopSize: number;
}

/**
 * Estimates the fundamental frequency of one frame using the YIN algorithm
 * (de Cheveigné & Kawahara, 2002). Returns null for silent or unpitched frames.
 */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  options: PitchDetectionOptions,
): number | null {
  if (rms(frame) < options.silenceRms) return null;

  const maxLag = Math.min(Math.floor(sampleRate / options.minFrequencyHz), Math.floor(frame.length / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / options.maxFrequencyHz));
  if (maxLag <= minLag) return null;

  const windowSize = frame.length - maxLag;
  const difference = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const delta = frame[i] - frame[i + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  // Cumulative mean normalised difference: removes the bias towards lag 0.
  const normalised = new Float32Array(maxLag + 1);
  normalised[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    runningSum += difference[lag];
    normalised[lag] = runningSum === 0 ? 1 : (difference[lag] * lag) / runningSum;
  }

  for (let lag = minLag; lag <= maxLag; lag++) {
    if (normalised[lag] < options.threshold) {
      while (lag + 1 <= maxLag && normalised[lag + 1] < normalised[lag]) lag++;
      return sampleRate / refineLag(normalised, lag);
    }
  }
  return null;
}

/** Runs pitch detection over the whole signal, one point per hop. */
export function analyzePitchTrack(
  samples: Float32Array,
  sampleRate: number,
  options: PitchTrackOptions,
): PitchTrack {
  const track: PitchTrack = [];
  for (let start = 0; start + options.frameSize <= samples.length; start += options.hopSize) {
    const frame = samples.subarray(start, start + options.frameSize);
    track.push({
      timeSec: (start + options.frameSize / 2) / sampleRate,
      frequencyHz: detectPitch(frame, sampleRate, options),
    });
  }
  return track;
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/** Parabolic interpolation around the minimum for sub-sample lag accuracy. */
function refineLag(values: Float32Array, lag: number): number {
  if (lag <= 0 || lag >= values.length - 1) return lag;
  const before = values[lag - 1];
  const at = values[lag];
  const after = values[lag + 1];
  const denominator = before - 2 * at + after;
  return denominator === 0 ? lag : lag + (before - after) / (2 * denominator);
}
