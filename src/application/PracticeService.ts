import type { SegmentResult } from '@/domain/comparison/compareTakes';
import type { PracticeAttempt, PracticeRules } from '@/domain/practice/practiceProgress';
import type { RecordingId } from '@/domain/recording/Recording';
import type { ReferenceId } from '@/domain/reference/Reference';
import type { ComparisonService } from './ComparisonService';
import type { Clock, IdGenerator } from './ports';

export interface PracticeServiceDeps {
  comparisons: ComparisonService;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Practice attempts at the weak sections of a take. Attempts are kept in memory for this
 * session only: they are short drills, and the full retake is what gets saved.
 */
export class PracticeService {
  private readonly attempts = new Map<string, PracticeAttempt[]>();

  constructor(
    private readonly deps: PracticeServiceDeps,
    readonly rules: PracticeRules,
  ) {}

  attemptsFor(referenceId: ReferenceId, recordingId: RecordingId): PracticeAttempt[] {
    return this.attempts.get(sessionKey(referenceId, recordingId)) ?? [];
  }

  /** Scores an attempt at one section and returns every attempt for this take and reference. */
  async addAttempt(input: {
    referenceId: ReferenceId;
    recordingId: RecordingId;
    section: SegmentResult;
    keyOffsetSemitones: number;
    audio: Blob;
  }): Promise<PracticeAttempt[]> {
    const result = await this.deps.comparisons.scoreSection(
      input.referenceId,
      input.section.reference,
      input.keyOffsetSemitones,
      input.audio,
    );
    const attempt: PracticeAttempt = {
      id: this.deps.ids.next(),
      sectionIndex: input.section.index,
      createdAt: this.deps.clock.now(),
      result: { ...result, index: input.section.index },
      audio: input.audio,
    };
    const all = [...this.attemptsFor(input.referenceId, input.recordingId), attempt];
    this.attempts.set(sessionKey(input.referenceId, input.recordingId), all);
    return all;
  }
}

function sessionKey(referenceId: ReferenceId, recordingId: RecordingId): string {
  return `${referenceId}|${recordingId}`;
}
