const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface NoteReading {
  name: string;
  /** Distance from the nearest equal-tempered note, -50..50. */
  cents: number;
}

export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

export function isNaturalNote(midi: number): boolean {
  return !midiToNoteName(midi).includes('#');
}

export function frequencyToNote(frequencyHz: number): NoteReading {
  const midi = frequencyToMidi(frequencyHz);
  const nearest = Math.round(midi);
  return { name: midiToNoteName(nearest), cents: Math.round((midi - nearest) * 100) };
}
