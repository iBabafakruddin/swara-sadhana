import type { PitchTrack } from '@/domain/analysis/pitchDetection';

/** Frame indices into a pitch track, end exclusive. */
export interface FrameRange {
  start: number;
  end: number;
}

export interface PhraseOptions {
  /** A silence at least this long ends a phrase; shorter ones are breaths inside it. */
  minGapSec: number;
  /** Phrases shorter than this are joined to a neighbour… */
  minPhraseSec: number;
  /** …unless the silence between them is longer than this. */
  maxMergeGapSec: number;
  /** Longer phrases are cut into equal parts no longer than this. */
  maxPhraseSec: number;
}

/** Seconds between pitch points; assumes the evenly spaced frames the analyzer produces. */
export function frameDuration(track: PitchTrack): number {
  return track.length > 1 ? track[1].timeSec - track[0].timeSec : 0.05;
}

/** Splits a reference into sung phrases at its pauses, giving practice-sized sections. */
export function findPhrases(track: PitchTrack, options: PhraseOptions): FrameRange[] {
  const hop = frameDuration(track);
  const minGapFrames = Math.max(1, Math.round(options.minGapSec / hop));

  const raw: FrameRange[] = [];
  let current: FrameRange | null = null;
  let silentRun = 0;
  track.forEach((point, index) => {
    if (point.frequencyHz === null) {
      silentRun++;
      return;
    }
    if (current && silentRun < minGapFrames) {
      current.end = index + 1;
    } else {
      current = { start: index, end: index + 1 };
      raw.push(current);
    }
    silentRun = 0;
  });

  const seconds = (range: FrameRange) => (range.end - range.start) * hop;
  const merged: FrameRange[] = [];
  for (const phrase of raw) {
    const last = merged.at(-1);
    const gapSec = last ? (phrase.start - last.end) * hop : Infinity;
    const eitherShort = last && (seconds(last) < options.minPhraseSec || seconds(phrase) < options.minPhraseSec);
    if (last && eitherShort && gapSec <= options.maxMergeGapSec) last.end = phrase.end;
    else merged.push({ ...phrase });
  }

  return merged.flatMap((phrase) => {
    const parts = Math.ceil(seconds(phrase) / options.maxPhraseSec);
    if (parts <= 1) return [phrase];
    const size = (phrase.end - phrase.start) / parts;
    return Array.from({ length: parts }, (_, k) => ({
      start: phrase.start + Math.round(k * size),
      end: phrase.start + Math.round((k + 1) * size),
    }));
  });
}
