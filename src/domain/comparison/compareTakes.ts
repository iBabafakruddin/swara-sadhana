import { frequencyToMidi } from '@/domain/analysis/notes';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import { alignSequences, foldOctave, type AlignedPair } from './alignment';
import { findPhrases, frameDuration, type FrameRange, type PhraseOptions } from './phrases';

export interface TimeRange {
  startSec: number;
  endSec: number;
}

export type SegmentIssue = 'flat' | 'sharp' | 'unsteady' | 'missed' | 'early' | 'late';

export interface SegmentResult {
  index: number;
  /** Where this section is in the reference. */
  reference: TimeRange;
  /** Where the singer sang it in the take. */
  take: TimeRange;
  /** 0..100. */
  score: number;
  /** Mean distance from the reference, in cents. */
  meanCentsOff: number;
  /** Average direction of the error: negative is flat, positive is sharp. */
  biasCents: number;
  /** Share of the reference's sung frames the singer also sang, 0..1. */
  coverage: number;
  /** Seconds late (positive) or early (negative), after allowing for a later start overall. */
  timingSec: number;
  issues: SegmentIssue[];
  needsWork: boolean;
}

export interface ComparisonReport {
  /** 0..100, weighted by how much singing each section has. */
  overallScore: number;
  /** How far the singer's key is from the reference; scores are measured after allowing for it. */
  keyOffsetSemitones: number;
  /** How much later than the reference the singer started. */
  timeOffsetSec: number;
  segments: SegmentResult[];
  /** The reference melody, moved into the singer's key and timing, on the take's timeline. */
  guideOnTake: PitchTrack;
}

export interface ScoringOptions {
  /** Mean errors at or below this still score 100. */
  perfectCents: number;
  /** Mean errors at or above this score 0. */
  zeroScoreCents: number;
  /** Singing this share of the reference counts as full coverage. */
  fullCoverage: number;
  /** Below this coverage a section is flagged as missed. */
  missedCoverage: number;
  /** An average lean beyond this is called flat or sharp. */
  biasCents: number;
  /** A spread beyond this is called unsteady. */
  unsteadyCents: number;
  /** Arriving this many seconds off is called early or late. */
  timingSec: number;
  /** Sections scoring below this need work even without a named issue. */
  passScore: number;
}

export interface ComparisonOptions {
  /** How far the singer may drift from the reference's timing. */
  maxDriftSec: number;
  stepPenalty: number;
  /** When false, only octave differences are allowed for; otherwise any key. */
  allowKeyChange: boolean;
  phrases: PhraseOptions;
  scoring: ScoringOptions;
}

/**
 * Compares a take with a reference: lines them up in time, allows for a different key,
 * then scores each phrase of the reference and says what went wrong in it.
 */
export function compareTakes(reference: PitchTrack, take: PitchTrack, options: ComparisonOptions): ComparisonReport {
  return compareWith(reference, take, options, { phrases: findPhrases(reference, options.phrases), takeName: 'this take' });
}

/**
 * Scores one practice attempt at a single section of the reference, as one segment.
 * The key is fixed to the one found for the full take, so a whole line sung flat
 * can't be mistaken for a change of key.
 */
export function compareSection(
  reference: PitchTrack,
  section: TimeRange,
  attempt: PitchTrack,
  keyOffsetSemitones: number,
  options: ComparisonOptions,
): SegmentResult {
  const slice = reference.filter((p) => p.timeSec >= section.startSec && p.timeSec < section.endSec);
  const sliceSec = slice.length * frameDuration(reference);
  // Attempts may be sung slowly on purpose, so allow the timing to drift by up to the whole section.
  const sectionOptions = { ...options, maxDriftSec: Math.max(options.maxDriftSec, sliceSec) };
  const report = compareWith(slice, attempt, sectionOptions, {
    phrases: [{ start: 0, end: slice.length }],
    keyOffsetSemitones,
    takeName: 'this attempt',
  });
  return report.segments[0];
}

interface CompareOverrides {
  phrases: FrameRange[];
  /** Skips key detection when the key is already known. */
  keyOffsetSemitones?: number;
  /** For the "nothing was sung" message. */
  takeName: string;
}

function compareWith(
  reference: PitchTrack,
  take: PitchTrack,
  options: ComparisonOptions,
  overrides: CompareOverrides,
): ComparisonReport {
  const refMidi = toMidi(reference);
  const takeMidi = toMidi(take);
  const refSpan = voicedSpan(refMidi);
  const takeSpan = voicedSpan(takeMidi);
  if (!refSpan) throw new Error('No clear singing was detected in the reference.');
  if (!takeSpan) throw new Error(`No clear singing was detected in ${overrides.takeName}.`);

  const roundShift = (semitones: number) =>
    options.allowKeyChange ? Math.round(semitones) : 12 * Math.round(semitones / 12);

  // Align the voiced parts only, in roughly the same key, so a late start or a lower key doesn't confuse the match.
  const roughShift = overrides.keyOffsetSemitones ?? roundShift(median(voiced(takeMidi)) - median(voiced(refMidi)));
  const refPart = refMidi.subarray(refSpan.start, refSpan.end);
  const takePart = takeMidi.slice(takeSpan.start, takeSpan.end).map((m) => m - roughShift);
  const bandFrames = options.maxDriftSec / frameDuration(reference);
  const path = alignSequences(refPart, takePart, { bandFrames, stepPenalty: options.stepPenalty }).map(
    (pair): AlignedPair => ({ ref: pair.ref + refSpan.start, take: pair.take + takeSpan.start }),
  );

  const bothVoiced = path.filter((p) => !Number.isNaN(refMidi[p.ref]) && !Number.isNaN(takeMidi[p.take]));
  const keyOffsetSemitones =
    overrides.keyOffsetSemitones ?? roundShift(median(bothVoiced.map((p) => takeMidi[p.take] - refMidi[p.ref])));
  const centsOff = (p: AlignedPair) => foldOctave(takeMidi[p.take] - refMidi[p.ref] - keyOffsetSemitones) * 100;

  // The first take frame matched to each reference frame tells us when the singer got there.
  const firstMatch = new Map<number, number>();
  for (const p of path) if (!firstMatch.has(p.ref)) firstMatch.set(p.ref, p.take);
  const delay = (refIndex: number) => take[firstMatch.get(refIndex)!].timeSec - reference[refIndex].timeSec;
  const timeOffsetSec = median([...firstMatch.keys()].filter((i) => !Number.isNaN(refMidi[i])).map(delay));

  const hop = frameDuration(take);
  const { phrases } = overrides;
  const segments = phrases.map((phrase, index): SegmentResult => {
    const pairs = path.filter((p) => p.ref >= phrase.start && p.ref < phrase.end);
    const sung = pairs.filter((p) => !Number.isNaN(refMidi[p.ref]));
    const cents = sung.filter((p) => !Number.isNaN(takeMidi[p.take])).map(centsOff);
    const coverage = sung.length ? cents.length / sung.length : 0;
    const timingSec = median([...new Set(sung.map((p) => p.ref))].map((i) => delay(i) - timeOffsetSec));
    const takeFrames = pairs.map((p) => p.take);

    const metrics = {
      meanCentsOff: mean(cents.map(Math.abs)),
      biasCents: mean(cents),
      spreadCents: standardDeviation(cents),
      coverage,
      timingSec,
    };
    const score = scoreSegment(metrics, cents.length > 0, options.scoring);
    const issues = findIssues(metrics, options.scoring);
    return {
      index,
      reference: { startSec: reference[phrase.start].timeSec, endSec: reference[phrase.end - 1].timeSec + hop },
      take: { startSec: take[Math.min(...takeFrames)].timeSec, endSec: take[Math.max(...takeFrames)].timeSec + hop },
      score,
      meanCentsOff: Math.round(metrics.meanCentsOff),
      biasCents: Math.round(metrics.biasCents),
      coverage,
      timingSec: round2(timingSec),
      issues,
      needsWork: score < options.scoring.passScore || issues.length > 0,
    };
  });

  const weights = phrases.map((phrase) => voiced(refMidi.subarray(phrase.start, phrase.end)).length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const overallScore = Math.round(
    segments.reduce((sum, segment, k) => sum + segment.score * weights[k], 0) / Math.max(1, totalWeight),
  );

  const shift = 2 ** (keyOffsetSemitones / 12);
  const refForTake = new Map<number, number>();
  for (const p of path) if (!refForTake.has(p.take)) refForTake.set(p.take, p.ref);
  const guideOnTake: PitchTrack = take.map((point, j) => {
    const refIndex = refForTake.get(j);
    const frequency = refIndex === undefined ? null : reference[refIndex].frequencyHz;
    return { timeSec: point.timeSec, frequencyHz: frequency === null ? null : frequency * shift };
  });

  return { overallScore, keyOffsetSemitones, timeOffsetSec: round2(timeOffsetSec), segments, guideOnTake };
}

interface SegmentMetrics {
  meanCentsOff: number;
  biasCents: number;
  spreadCents: number;
  coverage: number;
  timingSec: number;
}

function scoreSegment(metrics: SegmentMetrics, anySung: boolean, options: ScoringOptions): number {
  if (!anySung) return 0;
  const accuracy = clamp01(
    1 - (metrics.meanCentsOff - options.perfectCents) / (options.zeroScoreCents - options.perfectCents),
  );
  return Math.round(100 * accuracy * clamp01(metrics.coverage / options.fullCoverage));
}

function findIssues(metrics: SegmentMetrics, options: ScoringOptions): SegmentIssue[] {
  const issues: SegmentIssue[] = [];
  if (metrics.coverage < options.missedCoverage) issues.push('missed');
  if (metrics.biasCents <= -options.biasCents) issues.push('flat');
  if (metrics.biasCents >= options.biasCents) issues.push('sharp');
  if (metrics.spreadCents >= options.unsteadyCents) issues.push('unsteady');
  if (metrics.timingSec >= options.timingSec) issues.push('late');
  if (metrics.timingSec <= -options.timingSec) issues.push('early');
  return issues;
}

function toMidi(track: PitchTrack): Float64Array {
  return Float64Array.from(track, (p) => (p.frequencyHz === null ? NaN : frequencyToMidi(p.frequencyHz)));
}

function voiced(values: Float64Array): number[] {
  return Array.from(values).filter((v) => !Number.isNaN(v));
}

/** First and one-past-last sung frames, or null when nothing was sung. */
function voicedSpan(values: Float64Array): { start: number; end: number } | null {
  const start = values.findIndex((v) => !Number.isNaN(v));
  if (start < 0) return null;
  let end = values.length;
  while (Number.isNaN(values[end - 1])) end--;
  return { start, end };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - average) ** 2)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
