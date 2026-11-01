import type { ComparisonReport } from '@/domain/comparison/compareTakes';
import {
  bestBefore,
  dayKey,
  practiceStreak,
  previousTake,
  songJourney,
  takeScoreId,
  type PracticeLogEntry,
  type SongJourney,
  type Streak,
  type TakeScore,
} from '@/domain/progress/progress';
import type { Recording, RecordingId } from '@/domain/recording/Recording';
import type { ReferenceId } from '@/domain/reference/Reference';
import type { Clock, ProgressRepository } from './ports';

export interface ProgressServiceDeps {
  repository: ProgressRepository;
  clock: Clock;
}

/** How a new comparison stands against the song's history. */
export interface ComparisonOutcome {
  /** The take recorded just before this one, for before-and-after scores. */
  previous: TakeScore | null;
  /** Best overall score of any other take; null for the first take of a song. */
  bestBefore: number | null;
  isPersonalBest: boolean;
}

/** Long-term progress: score history per song, the practice log, and the daily streak. */
export class ProgressService {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: ProgressServiceDeps) {}

  /** Calls `listener` after any change to the history; returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async recordComparison(input: {
    referenceId: ReferenceId;
    recording: Pick<Recording, 'id' | 'title' | 'createdAt'>;
    report: ComparisonReport;
  }): Promise<ComparisonOutcome> {
    const { referenceId, recording, report } = input;
    const score: TakeScore = {
      id: takeScoreId(referenceId, recording.id),
      referenceId,
      recordingId: recording.id,
      takeTitle: recording.title,
      recordedAt: recording.createdAt,
      overallScore: report.overallScore,
      sectionScores: report.segments.map((s) => s.score),
      keyOffsetSemitones: report.keyOffsetSemitones,
    };
    await this.deps.repository.saveTakeScore(score);
    this.changed();
    const all = await this.deps.repository.takeScoresFor(referenceId);
    const best = bestBefore(all, score.id);
    return {
      previous: previousTake(all, recording.createdAt),
      bestBefore: best,
      isPersonalBest: best !== null && score.overallScore > best,
    };
  }

  async recordAttempt(entry: PracticeLogEntry): Promise<void> {
    await this.deps.repository.addPracticeLog(entry);
    await this.markActive(entry.createdAt);
  }

  async practiceLog(referenceId: ReferenceId, recordingId: RecordingId): Promise<PracticeLogEntry[]> {
    const log = await this.deps.repository.practiceLogFor(referenceId);
    return log.filter((e) => e.recordingId === recordingId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async markActive(at: number): Promise<void> {
    await this.deps.repository.markActiveDay(dayKey(at));
    this.changed();
  }

  async streak(): Promise<Streak> {
    return practiceStreak(await this.deps.repository.activeDays(), this.deps.clock.now());
  }

  async journey(referenceId: ReferenceId): Promise<SongJourney> {
    const [scores, log] = await Promise.all([
      this.deps.repository.takeScoresFor(referenceId),
      this.deps.repository.practiceLogFor(referenceId),
    ]);
    return songJourney(scores, log);
  }

  async forgetReference(referenceId: ReferenceId): Promise<void> {
    await this.deps.repository.deleteForReference(referenceId);
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
