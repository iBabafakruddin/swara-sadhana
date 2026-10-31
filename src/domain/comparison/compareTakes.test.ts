import { describe, expect, it } from 'vitest';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import { alignSequences } from './alignment';
import { compareSection, compareTakes, type ComparisonOptions } from './compareTakes';
import { describeKeyOffset, describeSegment } from './feedback';
import { findPhrases } from './phrases';

const HOP = 0.05;

const options: ComparisonOptions = {
  maxDriftSec: 3,
  stepPenalty: 0.2,
  allowKeyChange: true,
  phrases: { minGapSec: 0.3, minPhraseSec: 1, maxMergeGapSec: 1, maxPhraseSec: 8 },
  scoring: {
    perfectCents: 10,
    zeroScoreCents: 100,
    fullCoverage: 0.85,
    missedCoverage: 0.6,
    biasCents: 25,
    unsteadyCents: 40,
    timingSec: 0.3,
    passScore: 75,
  },
};

/** Builds a track from [MIDI note or null for silence, seconds] steps. */
function melody(steps: [number | null, number][]): PitchTrack {
  const track: PitchTrack = [];
  for (const [midi, seconds] of steps) {
    for (let k = 0; k < Math.round(seconds / HOP); k++) {
      track.push({
        timeSec: track.length * HOP,
        frequencyHz: midi === null ? null : 440 * 2 ** ((midi - 69) / 12),
      });
    }
  }
  return track;
}

// Three phrases separated by clear pauses.
const phraseA: [number, number][] = [
  [60, 0.6],
  [62, 0.6],
  [64, 0.8],
];
const phraseB: [number, number][] = [
  [65, 0.5],
  [67, 1],
  [65, 0.5],
];
const phraseC: [number, number][] = [
  [64, 0.6],
  [62, 0.6],
  [60, 1],
];
const pause: [null, number] = [null, 1];
const shift = (steps: [number, number][], by: number) => steps.map(([m, s]): [number, number] => [m + by, s]);

const reference = melody([pause, ...phraseA, pause, ...phraseB, pause, ...phraseC, pause]);

describe('alignSequences', () => {
  it('matches identical sequences frame by frame', () => {
    const seq = Float64Array.from([60, 62, NaN, 64, 65]);
    const path = alignSequences(seq, seq, { bandFrames: 2, stepPenalty: 0.2 });
    expect(path).toEqual([0, 1, 2, 3, 4].map((i) => ({ ref: i, take: i })));
  });

  it('stretches to follow a held note', () => {
    const ref = Float64Array.from([60, 62, 64]);
    const take = Float64Array.from([60, 62, 62, 62, 64]);
    const path = alignSequences(ref, take, { bandFrames: 3, stepPenalty: 0.2 });
    expect(path.filter((p) => p.ref === 1).map((p) => p.take)).toEqual([1, 2, 3]);
    expect(path.at(-1)).toEqual({ ref: 2, take: 4 });
  });
});

describe('findPhrases', () => {
  it('splits at pauses but not at short breaths', () => {
    const track = melody([[60, 1.5], [null, 0.1], [62, 1.5], [null, 1], [64, 1.5]]);
    const phrases = findPhrases(track, options.phrases);
    expect(phrases).toHaveLength(2);
    expect(phrases[0].start).toBe(0);
  });

  it('joins very short phrases to a neighbour and cuts long ones', () => {
    const short = melody([[60, 0.4], [null, 0.5], [62, 2]]);
    expect(findPhrases(short, options.phrases)).toHaveLength(1);

    const long = melody([[60, 20]]);
    const parts = findPhrases(long, options.phrases);
    expect(parts).toHaveLength(3);
    expect(parts.at(-1)!.end).toBe(long.length);
  });
});

describe('compareTakes', () => {
  it('gives a perfect score to an identical take', () => {
    const report = compareTakes(reference, reference, options);
    expect(report.overallScore).toBe(100);
    expect(report.keyOffsetSemitones).toBe(0);
    expect(report.segments).toHaveLength(3);
    expect(report.segments.every((s) => !s.needsWork)).toBe(true);
  });

  it('allows for a later start and a lower key', () => {
    const take = melody([
      [null, 2],
      ...shift(phraseA, -2),
      pause,
      ...shift(phraseB, -2),
      pause,
      ...shift(phraseC, -2),
      pause,
    ]);
    const report = compareTakes(reference, take, options);
    expect(report.keyOffsetSemitones).toBe(-2);
    expect(report.timeOffsetSec).toBeCloseTo(1, 1);
    expect(report.overallScore).toBeGreaterThanOrEqual(95);
    // The guide sits on the take's timeline, in the singer's key.
    const guided = report.guideOnTake.find((p) => p.timeSec >= 2.1 && p.frequencyHz !== null)!;
    expect(guided.frequencyHz).toBeCloseTo(440 * 2 ** ((58 - 69) / 12), 1);
  });

  it('flags the one phrase that was sung flat', () => {
    const take = melody([pause, ...phraseA, pause, ...shift(phraseB, -0.5), pause, ...phraseC, pause]);
    const report = compareTakes(reference, take, options);
    const [a, b, c] = report.segments;
    expect(a.needsWork).toBe(false);
    expect(c.needsWork).toBe(false);
    expect(b.needsWork).toBe(true);
    expect(b.issues).toContain('flat');
    expect(b.biasCents).toBe(-50);
    expect(describeSegment(b)[0]).toMatch(/50 cents flat/);
  });

  it('flags a phrase that was left out', () => {
    const take = melody([pause, ...phraseA, pause, [null, 2], pause, ...phraseC, pause]);
    const report = compareTakes(reference, take, options);
    expect(report.segments[1].issues).toContain('missed');
    expect(report.segments[1].score).toBe(0);
    expect(report.overallScore).toBeLessThan(75);
  });

  it('only allows for octaves when key changes are off', () => {
    const take = melody([pause, ...shift(phraseA, -12), pause, ...shift(phraseB, -12), pause, ...shift(phraseC, -12)]);
    const report = compareTakes(reference, take, { ...options, allowKeyChange: false });
    expect(report.keyOffsetSemitones).toBe(-12);
    expect(report.overallScore).toBe(100);
  });

  it('explains when nothing was sung', () => {
    expect(() => compareTakes(reference, melody([[null, 3]]), options)).toThrow(/this take/);
    expect(() => compareTakes(melody([[null, 3]]), reference, options)).toThrow(/reference/);
  });
});

describe('compareSection', () => {
  // Phrase B sits at 4–6 s in the reference.
  const sectionB = { startSec: 4, endSec: 6 };

  it('scores an attempt at one section, ignoring the silence around it', () => {
    const attempt = melody([[null, 1.5], ...shift(phraseB, -2), [null, 0.8]]);
    const result = compareSection(reference, sectionB, attempt, -2, options);
    expect(result.score).toBe(100);
    expect(result.needsWork).toBe(false);
  });

  it('keeps the known key, so a line sung flat is still called flat', () => {
    const attempt = melody([[null, 1], ...shift(phraseB, -2.6)]);
    const result = compareSection(reference, sectionB, attempt, -2, options);
    expect(result.biasCents).toBe(-60);
    expect(result.issues).toContain('flat');
  });

  it('accepts an attempt sung at half speed', () => {
    const slow = phraseB.map(([m, s]): [number, number] => [m - 2, s * 2]);
    const result = compareSection(reference, sectionB, melody([[null, 1], ...slow]), -2, options);
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it('explains an attempt with no singing', () => {
    expect(() => compareSection(reference, sectionB, melody([[null, 2]]), 0, options)).toThrow(/this attempt/);
  });
});

describe('describeKeyOffset', () => {
  it('describes semitones and octaves', () => {
    expect(describeKeyOffset(0)).toBeNull();
    expect(describeKeyOffset(-2)).toMatch(/^You sang 2 semitones lower/);
    expect(describeKeyOffset(12)).toMatch(/^You sang an octave higher/);
    expect(describeKeyOffset(1)).toMatch(/1 semitone higher/);
  });
});
