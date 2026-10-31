import { frequencyToMidi, midiToNoteName } from './notes';
import type { PitchTrack } from './pitchDetection';

export interface PitchSummary {
  lowestNote: string;
  highestNote: string;
  mostSungNote: string;
  /** Mean absolute distance from the nearest note, in cents. Lower means more in tune. */
  averageCentsOff: number;
  /** Share of the take where a pitch was detected, 0..1. */
  voicedRatio: number;
}

/** Summarises a pitch track for feedback; null when nothing was sung. */
export function summarizePitch(track: PitchTrack): PitchSummary | null {
  const midis = track
    .map((p) => p.frequencyHz)
    .filter((f): f is number => f !== null)
    .map(frequencyToMidi);
  if (midis.length === 0) return null;

  // Percentiles rather than min/max so a single octave glitch doesn't skew the range.
  const sorted = [...midis].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

  const counts = new Map<number, number>();
  for (const midi of midis) {
    const note = Math.round(midi);
    counts.set(note, (counts.get(note) ?? 0) + 1);
  }
  const [mostSung] = [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best));

  const averageCentsOff = midis.reduce((sum, m) => sum + Math.abs(m - Math.round(m)) * 100, 0) / midis.length;

  return {
    lowestNote: midiToNoteName(percentile(0.05)),
    highestNote: midiToNoteName(percentile(0.95)),
    mostSungNote: midiToNoteName(mostSung),
    averageCentsOff: Math.round(averageCentsOff),
    voicedRatio: midis.length / track.length,
  };
}
