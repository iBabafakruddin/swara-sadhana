import { describe, expect, it } from 'vitest';
import { frequencyToNote, isNaturalNote } from './notes';
import { summarizePitch } from './pitchSummary';
import { findShruti, SHRUTIS } from './shruti';

describe('frequencyToNote', () => {
  it.each([
    [440, 'A4'],
    [261.63, 'C4'],
    [466.16, 'A#4'],
    [82.41, 'E2'],
  ])('%d Hz is %s', (frequency, name) => {
    const note = frequencyToNote(frequency);
    expect(note.name).toBe(name);
    expect(Math.abs(note.cents)).toBeLessThanOrEqual(1);
  });

  it('reports cents sharp of the nearest note', () => {
    expect(frequencyToNote(440 * Math.pow(2, 20 / 1200)).cents).toBe(20);
  });

  it('knows natural notes from sharps', () => {
    expect(isNaturalNote(69)).toBe(true);
    expect(isNaturalNote(70)).toBe(false);
  });
});

describe('summarizePitch', () => {
  it('returns null when nothing was sung', () => {
    expect(summarizePitch([{ timeSec: 0, frequencyHz: null }])).toBeNull();
  });

  it('summarises range, most sung note and voiced share', () => {
    const summary = summarizePitch([
      { timeSec: 0, frequencyHz: 440 },
      { timeSec: 0.1, frequencyHz: 440 },
      { timeSec: 0.2, frequencyHz: 523.25 },
      { timeSec: 0.3, frequencyHz: null },
    ]);
    expect(summary).toMatchObject({ mostSungNote: 'A4', lowestNote: 'A4', highestNote: 'C5', voicedRatio: 0.75 });
  });
});

describe('shrutis', () => {
  it('lists the twelve keys with their kattai numbers', () => {
    expect(SHRUTIS).toHaveLength(12);
    expect(findShruti('C#')).toMatchObject({ kattai: '1½' });
    expect(findShruti('A')?.frequencyHz).toBeCloseTo(220, 5);
    expect(findShruti('G')?.kattai).toBe('5');
  });
});
