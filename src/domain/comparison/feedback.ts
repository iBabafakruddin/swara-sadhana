import type { SegmentResult } from './compareTakes';

/** Plain-language notes on what to fix in a section, most important first. */
export function describeSegment(segment: SegmentResult): string[] {
  const notes: string[] = [];
  for (const issue of segment.issues) {
    switch (issue) {
      case 'missed':
        notes.push(`Only ${Math.round(segment.coverage * 100)}% of this line came through. Sing it fully, or a little louder.`);
        break;
      case 'flat':
        notes.push(`About ${Math.abs(segment.biasCents)} cents flat. Aim slightly higher.`);
        break;
      case 'sharp':
        notes.push(`About ${segment.biasCents} cents sharp. Aim slightly lower.`);
        break;
      case 'unsteady':
        notes.push("The pitch wanders away from the reference's movement. Hold the notes steadier.");
        break;
      case 'late':
        notes.push(`Came in about ${segment.timingSec.toFixed(1)} s late.`);
        break;
      case 'early':
        notes.push(`Came in about ${Math.abs(segment.timingSec).toFixed(1)} s early.`);
        break;
    }
  }
  if (notes.length === 0 && segment.needsWork) notes.push(`Off by about ${segment.meanCentsOff} cents on average.`);
  return notes;
}

/** Explains a key difference, or null when the singer used the reference's key. */
export function describeKeyOffset(semitones: number): string | null {
  if (semitones === 0) return null;
  const direction = semitones < 0 ? 'lower' : 'higher';
  const size = Math.abs(semitones);
  const amount =
    size % 12 === 0
      ? size === 12
        ? 'an octave'
        : `${size / 12} octaves`
      : `${size} semitone${size === 1 ? '' : 's'}`;
  return `You sang ${amount} ${direction} than the reference. That's fine: scores are measured in your key.`;
}
