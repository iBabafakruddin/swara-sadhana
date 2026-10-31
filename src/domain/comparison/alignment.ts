/** One frame of the reference matched to one frame of the take. */
export interface AlignedPair {
  ref: number;
  take: number;
}

export interface AlignmentOptions {
  /** How far, in frames, the path may stray from the straight line between both ends. */
  bandFrames: number;
  /** Extra cost for stretching either side, so the path only warps when it helps. */
  stepPenalty: number;
}

// Local costs are in semitones. Capping keeps one wild note from dragging the path around.
const MAX_PITCH_COST = 3;
const VOICING_MISMATCH_COST = 1.5;

const DIAGONAL = 0;
const FROM_ABOVE = 1;
const FROM_LEFT = 2;

/** Wraps a semitone difference into -6..6, so octave jumps (common detector glitches) don't count as misses. */
export function foldOctave(semitones: number): number {
  return semitones - 12 * Math.round(semitones / 12);
}

function localCost(a: number, b: number): number {
  const aVoiced = !Number.isNaN(a);
  const bVoiced = !Number.isNaN(b);
  if (aVoiced && bVoiced) return Math.min(Math.abs(foldOctave(b - a)), MAX_PITCH_COST);
  return aVoiced === bVoiced ? 0 : VOICING_MISMATCH_COST;
}

/**
 * Dynamic time warping between two pitch sequences (MIDI note numbers, NaN where silent),
 * restricted to a band around the diagonal so long songs stay fast and memory-light.
 * Returns the matched frames from (0, 0) to the last frame of both, in order.
 */
export function alignSequences(ref: Float64Array, take: Float64Array, options: AlignmentOptions): AlignedPair[] {
  const n = ref.length;
  const m = take.length;
  if (n === 0 || m === 0) return [];

  const slope = n > 1 ? (m - 1) / (n - 1) : 0;
  // The band must be wide enough for consecutive rows to overlap, or the end becomes unreachable.
  const band = n === 1 ? m : Math.max(Math.ceil(options.bandFrames), Math.ceil(slope) + 1);
  const width = 2 * band + 1;
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  const steps = new Uint8Array(n * width);

  let prev = new Float64Array(m).fill(Infinity);
  let curr = new Float64Array(m).fill(Infinity);

  for (let i = 0; i < n; i++) {
    const center = Math.round(i * slope);
    lo[i] = Math.max(0, center - band);
    hi[i] = Math.min(m - 1, center + band);
    // `curr` still holds row i - 2; clear its band so stale costs can't leak in.
    if (i >= 2) curr.fill(Infinity, lo[i - 2], hi[i - 2] + 1);

    for (let j = lo[i]; j <= hi[i]; j++) {
      let best = 0;
      let step = DIAGONAL;
      if (i > 0 || j > 0) {
        best = i > 0 && j > 0 ? prev[j - 1] : Infinity;
        const above = i > 0 ? prev[j] + options.stepPenalty : Infinity;
        const left = j > 0 ? curr[j - 1] + options.stepPenalty : Infinity;
        if (above < best) {
          best = above;
          step = FROM_ABOVE;
        }
        if (left < best) {
          best = left;
          step = FROM_LEFT;
        }
      }
      curr[j] = best + localCost(ref[i], take[j]);
      steps[i * width + (j - lo[i])] = step;
    }
    [prev, curr] = [curr, prev];
  }

  const path: AlignedPair[] = [];
  let i = n - 1;
  let j = m - 1;
  for (;;) {
    path.push({ ref: i, take: j });
    if (i === 0 && j === 0) break;
    const step = steps[i * width + (j - lo[i])];
    if (step === DIAGONAL) {
      i--;
      j--;
    } else if (step === FROM_ABOVE) {
      i--;
    } else {
      j--;
    }
  }
  return path.reverse();
}
