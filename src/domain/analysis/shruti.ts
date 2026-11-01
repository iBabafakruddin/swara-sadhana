import { midiToNoteName } from './notes';

export interface Shruti {
  /** Western note name without octave, e.g. "C#". */
  note: string;
  /** Carnatic "kattai" (key) number used on harmoniums and shruti boxes, e.g. "1½". */
  kattai: string;
  frequencyHz: number;
}

const KATTAI = ['1', '1½', '2', '2½', '3', '4', '4½', '5', '5½', '6', '6½', '7'];
/** C3: Sa for these shrutis sits in the octave most singers use for their tanpura. */
const FIRST_MIDI = 48;

export const SHRUTIS: Shruti[] = KATTAI.map((kattai, i) => ({
  note: midiToNoteName(FIRST_MIDI + i).replace(/\d+$/, ''),
  kattai,
  frequencyHz: 440 * 2 ** ((FIRST_MIDI + i - 69) / 12),
}));

export function findShruti(note: string): Shruti | undefined {
  return SHRUTIS.find((s) => s.note === note);
}
