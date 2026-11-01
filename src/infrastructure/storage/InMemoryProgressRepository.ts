import type { ProgressRepository } from '@/application/ports';
import type { PracticeLogEntry, TakeScore } from '@/domain/progress/progress';
import type { ReferenceId } from '@/domain/reference/Reference';

/** Non-persistent repository for tests and environments without IndexedDB. */
export class InMemoryProgressRepository implements ProgressRepository {
  private readonly scores = new Map<string, TakeScore>();
  private readonly log = new Map<string, PracticeLogEntry>();
  private readonly days = new Set<string>();

  async saveTakeScore(score: TakeScore): Promise<void> {
    this.scores.set(score.id, score);
  }

  async takeScoresFor(referenceId: ReferenceId): Promise<TakeScore[]> {
    return [...this.scores.values()].filter((s) => s.referenceId === referenceId);
  }

  async addPracticeLog(entry: PracticeLogEntry): Promise<void> {
    this.log.set(entry.id, entry);
  }

  async practiceLogFor(referenceId: ReferenceId): Promise<PracticeLogEntry[]> {
    return [...this.log.values()].filter((e) => e.referenceId === referenceId);
  }

  async markActiveDay(day: string): Promise<void> {
    this.days.add(day);
  }

  async activeDays(): Promise<string[]> {
    return [...this.days];
  }

  async deleteForReference(referenceId: ReferenceId): Promise<void> {
    for (const [id, score] of this.scores) if (score.referenceId === referenceId) this.scores.delete(id);
    for (const [id, entry] of this.log) if (entry.referenceId === referenceId) this.log.delete(id);
  }
}
