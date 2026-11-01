import type { SegmentResult } from '@/domain/comparison/compareTakes';
import type { PracticeAttempt, PracticeRules } from '@/domain/practice/practiceProgress';
import type { RecordingId } from '@/domain/recording/Recording';
import type { ReferenceId } from '@/domain/reference/Reference';
import type { ComparisonService } from './ComparisonService';
import type { Clock, IdGenerator } from './ports';
import type { ProgressService } from './ProgressService';

export interface PracticeServiceDeps {
  comparisons: Pick<ComparisonService, 'scoreSection'>;
  /** Keeps attempt scores across reloads; optional so tests can leave it out. */
  history?: Pick<ProgressService, 'recordAttempt' | 'practiceLog'>;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Practice attempts at the weak sections of a take. Scores are saved to the history;
 * the audio of an attempt is kept in memory only, for listening back during the session.
 */
export class PracticeService {
  private readonly attempts = new Map<string, Promise<PracticeAttempt[]>>();

  constructor(
    private readonly deps: PracticeServiceDeps,
    readonly rules: PracticeRules,
  ) {}

  /** Every attempt for this take and reference, oldest first. Reloaded ones have no audio. */
  attemptsFor(referenceId: ReferenceId, recordingId: RecordingId): Promise<PracticeAttempt[]> {
    const key = sessionKey(referenceId, recordingId);
    let attempts = this.attempts.get(key);
    if (!attempts) {
      attempts = this.loadSaved(referenceId, recordingId);
      this.attempts.set(key, attempts);
    }
    return attempts;
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
    const all = [...(await this.attemptsFor(input.referenceId, input.recordingId)), attempt];
    this.attempts.set(sessionKey(input.referenceId, input.recordingId), Promise.resolve(all));
    await this.deps.history?.recordAttempt({
      id: attempt.id,
      referenceId: input.referenceId,
      recordingId: input.recordingId,
      sectionIndex: attempt.sectionIndex,
      createdAt: attempt.createdAt,
      result: attempt.result,
    });
    return all;
  }

  private async loadSaved(referenceId: ReferenceId, recordingId: RecordingId): Promise<PracticeAttempt[]> {
    const log = (await this.deps.history?.practiceLog(referenceId, recordingId)) ?? [];
    return log.map(({ id, sectionIndex, createdAt, result }) => ({ id, sectionIndex, createdAt, result }));
  }
}

function sessionKey(referenceId: ReferenceId, recordingId: RecordingId): string {
  return `${referenceId}|${recordingId}`;
}
