import { describe, expect, it } from 'vitest';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import { appConfig } from '@/config/appConfig';
import { InMemoryProgressRepository } from '@/infrastructure/storage/InMemoryProgressRepository';
import { InMemoryRecordingRepository } from '@/infrastructure/storage/InMemoryRecordingRepository';
import { InMemoryReferenceRepository } from '@/infrastructure/storage/InMemoryReferenceRepository';
import { ComparisonService } from './ComparisonService';
import type { PitchAnalyzer } from './ports';
import { PracticeService } from './PracticeService';
import { ProgressService } from './ProgressService';

const HOP = 0.05;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Silence, then two phrases (A3 then B3), then silence, at 50 ms per point. */
function song(shiftSemitones: number): PitchTrack {
  const notes = [...Array(10).fill(null), ...Array(30).fill(57), ...Array(10).fill(null), ...Array(30).fill(59), ...Array(10).fill(null)];
  return notes.map((midi, i) => ({ timeSec: i * HOP, frequencyHz: midi === null ? null : hz(midi + shiftSemitones) }));
}

async function setup() {
  const audio = {
    reference: new Blob(['ref']),
    take: new Blob(['take']),
    retake: new Blob(['retake']),
    good: new Blob(['good']),
    flat: new Blob(['flat']),
  };
  const tracks = new Map<Blob, PitchTrack>([
    [audio.reference, song(0)],
    [audio.take, song(-2)],
    [audio.retake, song(-2.1)],
    // Attempts at the second phrase only, in the singer's key (2 lower).
    [audio.good, song(-2).slice(48)],
    [audio.flat, song(-2.6).slice(48)],
  ]);
  const analyzer: PitchAnalyzer = { analyze: async (blob) => tracks.get(blob)! };
  const references = new InMemoryReferenceRepository();
  const recordings = new InMemoryRecordingRepository();
  await references.save({ id: 'r', title: 'r', createdAt: 0, durationMs: 0, mimeType: '', sizeBytes: 1, source: 'upload', audio: audio.reference });
  await recordings.save({ id: 't', title: 't', createdAt: 0, expiresAt: 1, durationMs: 0, mimeType: '', sizeBytes: 1, audio: audio.take });
  await recordings.save({ id: 't2', title: 't2', createdAt: 5, expiresAt: 9, durationMs: 0, mimeType: '', sizeBytes: 1, audio: audio.retake });
  const progressRepository = new InMemoryProgressRepository();
  const progress = new ProgressService({ repository: progressRepository, clock: { now: () => 0 } });
  const comparisons = new ComparisonService({ references, recordings, analyzer, history: progress }, appConfig.comparison);
  let id = 0;
  const newPractice = () =>
    new PracticeService(
      { comparisons, history: progress, clock: { now: () => 0 }, ids: { next: () => `a${++id}` } },
      { passScore: 75, passesInARow: 2 },
    );
  return { audio, comparisons, practice: newPractice(), newPractice, progress, progressRepository };
}

describe('PracticeService', () => {
  it('scores attempts at a section in the singer key and keeps them per take', async () => {
    const { audio, comparisons, practice } = await setup();
    const { report } = await comparisons.compare('r', 't');
    expect(report.keyOffsetSemitones).toBe(-2);
    const section = report.segments[1];

    await practice.addAttempt({ referenceId: 'r', recordingId: 't', section, keyOffsetSemitones: -2, audio: audio.flat });
    const attempts = await practice.addAttempt({
      referenceId: 'r',
      recordingId: 't',
      section,
      keyOffsetSemitones: -2,
      audio: audio.good,
    });

    expect(attempts.map((a) => a.result.score)).toEqual([expect.any(Number), 100]);
    expect(attempts[0].result.issues).toContain('flat');
    expect(attempts.every((a) => a.sectionIndex === 1 && a.result.index === 1)).toBe(true);
    expect(await practice.attemptsFor('r', 't')).toHaveLength(2);
    expect(await practice.attemptsFor('r', 'other')).toEqual([]);
  });

  it('keeps attempt scores, but not audio, for the next session', async () => {
    const { audio, comparisons, practice, newPractice, progressRepository } = await setup();
    const { report } = await comparisons.compare('r', 't');
    const input = { referenceId: 'r', recordingId: 't', section: report.segments[1], keyOffsetSemitones: -2 };
    await practice.addAttempt({ ...input, audio: audio.good });

    const reloaded = await newPractice().attemptsFor('r', 't');
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ sectionIndex: 1, result: { score: 100 } });
    expect(reloaded[0].audio).toBeUndefined();
    // The attempt also counts towards the daily streak.
    expect(await progressRepository.activeDays()).toHaveLength(1);
  });
});

describe('progress history', () => {
  it('records each comparison and compares it with earlier takes', async () => {
    const { comparisons, progress } = await setup();
    const first = await comparisons.compare('r', 't');
    expect(first.outcome).toEqual({ previous: null, bestBefore: null, isPersonalBest: false });

    const second = await comparisons.compare('r', 't2');
    expect(second.outcome?.previous?.recordingId).toBe('t');
    expect(second.outcome?.bestBefore).toBe(100);

    // Comparing the same take again replaces its entry rather than adding one.
    await comparisons.compare('r', 't');
    const journey = await progress.journey('r');
    expect(journey.takes.map((t) => t.recordingId)).toEqual(['t', 't2']);
  });

  it('forgets a deleted reference', async () => {
    const { comparisons, progress } = await setup();
    await comparisons.compare('r', 't');
    await progress.forgetReference('r');
    expect((await progress.journey('r')).takes).toEqual([]);
  });
});
