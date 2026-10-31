import type { RecordingRepository } from '@/application/ports';
import type { Recording, RecordingId } from '@/domain/recording/Recording';

/** Non-persistent repository for tests and environments without IndexedDB. */
export class InMemoryRecordingRepository implements RecordingRepository {
  private readonly records = new Map<RecordingId, Recording>();

  async save(recording: Recording): Promise<void> {
    this.records.set(recording.id, recording);
  }

  async findAll(): Promise<Recording[]> {
    return [...this.records.values()];
  }

  async findById(id: RecordingId): Promise<Recording | undefined> {
    return this.records.get(id);
  }

  async delete(id: RecordingId): Promise<void> {
    this.records.delete(id);
  }

  async deleteExpired(now: number): Promise<number> {
    let removed = 0;
    for (const [id, recording] of this.records) {
      if (recording.expiresAt <= now) {
        this.records.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
