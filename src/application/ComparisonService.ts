import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import {
  compareSection,
  compareTakes,
  type ComparisonOptions,
  type ComparisonReport,
  type SegmentResult,
  type TimeRange,
} from '@/domain/comparison/compareTakes';
import type { RecordingId } from '@/domain/recording/Recording';
import type { ReferenceId } from '@/domain/reference/Reference';
import type { PitchAnalyzer, RecordingRepository, ReferenceRepository } from './ports';

export interface ComparisonServiceDeps {
  references: ReferenceRepository;
  recordings: RecordingRepository;
  /** Should use a finer time step than the pitch view; timing feedback depends on it. */
  analyzer: PitchAnalyzer;
}

export interface Comparison {
  report: ComparisonReport;
  takeTrack: PitchTrack;
  referenceTrack: PitchTrack;
}

/** Compares a take with a reference and reports which sections need practice. */
export class ComparisonService {
  // References never change and takes only expire, so each one is analysed once per session.
  private readonly tracks = new Map<string, Promise<PitchTrack>>();
  private readonly reports = new Map<string, ComparisonReport>();

  constructor(
    private readonly deps: ComparisonServiceDeps,
    private readonly options: ComparisonOptions,
  ) {}

  async compare(referenceId: ReferenceId, recordingId: RecordingId): Promise<Comparison> {
    const [referenceTrack, takeTrack] = await Promise.all([
      this.referenceTrack(referenceId),
      this.track(`take:${recordingId}`, async () => {
        const recording = await this.deps.recordings.findById(recordingId);
        if (!recording) throw new Error('This take no longer exists. It may have expired.');
        return recording.audio;
      }),
    ]);
    const report = compareTakes(referenceTrack, takeTrack, this.options);
    this.reports.set(pairKey(referenceId, recordingId), report);
    return { report, takeTrack, referenceTrack };
  }

  /** A comparison already made this session, without analysing anything new. */
  earlierReport(referenceId: ReferenceId, recordingId: RecordingId): ComparisonReport | undefined {
    return this.reports.get(pairKey(referenceId, recordingId));
  }

  /** Scores a practice attempt at one section, in the singer's known key. */
  async scoreSection(
    referenceId: ReferenceId,
    section: TimeRange,
    keyOffsetSemitones: number,
    attempt: Blob,
  ): Promise<SegmentResult> {
    const [referenceTrack, attemptTrack] = await Promise.all([
      this.referenceTrack(referenceId),
      // Attempts are scored once, so they skip the cache.
      this.deps.analyzer.analyze(attempt),
    ]);
    return compareSection(referenceTrack, section, attemptTrack, keyOffsetSemitones, this.options);
  }

  private referenceTrack(referenceId: ReferenceId): Promise<PitchTrack> {
    return this.track(`reference:${referenceId}`, async () => {
      const reference = await this.deps.references.findById(referenceId);
      if (!reference) throw new Error('This reference no longer exists.');
      return reference.audio;
    });
  }

  private track(key: string, load: () => Promise<Blob>): Promise<PitchTrack> {
    let track = this.tracks.get(key);
    if (!track) {
      track = load().then((audio) => this.deps.analyzer.analyze(audio));
      // Don't keep failures around; the next attempt should try again.
      track.catch(() => this.tracks.delete(key));
      this.tracks.set(key, track);
    }
    return track;
  }
}

function pairKey(referenceId: ReferenceId, recordingId: RecordingId): string {
  return `${referenceId}|${recordingId}`;
}
