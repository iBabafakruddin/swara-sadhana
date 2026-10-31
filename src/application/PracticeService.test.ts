import { describe, expect, it } from 'vitest';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import { appConfig } from '@/config/appConfig';
import { InMemoryRecordingRepository } from '@/infrastructure/storage/InMemoryRecordingRepository';
import { InMemoryReferenceRepository } from '@/infrastructure/storage/InMemoryReferenceRepository';
import { ComparisonService } from './ComparisonService';
import type { PitchAnalyzer } from './ports';
import { PracticeService } from './PracticeService';

const HOP = 0.05;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Silence, then two phrases (A3 then B3), then silence, at 50 ms per point. */
function song(shiftSemitones: number): PitchTrack {
  const notes = [...Array(10).fill(null), ...Array(30).fill(57), ...Array(10).fill(null), ...Array(30).fill(59), ...Array(10).fill(null)];
  return notes.map((midi, i) => ({ timeSec: i * HOP, frequencyHz: midi === null ? null : hz(midi + shiftSemitones) }));
}

async function setup() {
  const audio = { reference: new Blob(['ref']), take: new Blob(['take']), good: new Blob(['good']), flat: new Blob(['flat']) };
  const tracks = new Map<Blob, PitchTrack>([
    [audio.reference, song(0)],
    [audio.take, song(-2)],
    // Attempts at the second phrase only, in the singer's key (2 lower).
    [audio.good, song(-2).slice(48)],
    [audio.flat, song(-2.6).slice(48)],
  ]);
  const analyzer: PitchAnalyzer = { analyze: async (blob) => tracks.get(blob)! };
  const references = new InMemoryReferenceRepository();
  const recordings = new InMemoryRecordingRepository();
  await references.save({ id: 'r', title: 'r', createdAt: 0, durationMs: 0, mimeType: '', sizeBytes: 1, source: 'upload', audio: audio.reference });
  await recordings.save({ id: 't', title: 't', createdAt: 0, expiresAt: 1, durationMs: 0, mimeType: '', sizeBytes: 1, audio: audio.take });
  const comparisons = new ComparisonService({ references, recordings, analyzer }, appConfig.comparison);
  let id = 0;
  const practice = new PracticeService(
    { comparisons, clock: { now: () => 0 }, ids: { next: () => `a${++id}` } },
    { passScore: 75, passesInARow: 2 },
  );
  return { audio, comparisons, practice };
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
    expect(practice.attemptsFor('r', 't')).toHaveLength(2);
    expect(practice.attemptsFor('r', 'other')).toEqual([]);
  });

  it('remembers comparisons made earlier, for before and after scores', async () => {
    const { comparisons } = await setup();
    expect(comparisons.earlierReport('r', 't')).toBeUndefined();
    await comparisons.compare('r', 't');
    expect(comparisons.earlierReport('r', 't')?.overallScore).toBe(100);
  });
});
