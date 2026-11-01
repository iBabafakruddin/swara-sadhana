import type { ProgressRepository } from '@/application/ports';
import type { PracticeLogEntry, TakeScore } from '@/domain/progress/progress';
import type { ReferenceId } from '@/domain/reference/Reference';
import {
  ACTIVE_DAYS_STORE,
  openDatabase,
  PRACTICE_LOG_STORE,
  REFERENCE_ID_INDEX,
  runInStore,
  TAKE_SCORES_STORE,
} from './database';

/** Keeps score history, the practice log and active days in IndexedDB. */
export class IndexedDbProgressRepository implements ProgressRepository {
  constructor(private readonly databaseName: string) {}

  async saveTakeScore(score: TakeScore): Promise<void> {
    await runInStore(this.databaseName, TAKE_SCORES_STORE, 'readwrite', (store) => store.put(score));
  }

  takeScoresFor(referenceId: ReferenceId): Promise<TakeScore[]> {
    return this.byReference<TakeScore>(TAKE_SCORES_STORE, referenceId);
  }

  async addPracticeLog(entry: PracticeLogEntry): Promise<void> {
    await runInStore(this.databaseName, PRACTICE_LOG_STORE, 'readwrite', (store) => store.put(entry));
  }

  practiceLogFor(referenceId: ReferenceId): Promise<PracticeLogEntry[]> {
    return this.byReference<PracticeLogEntry>(PRACTICE_LOG_STORE, referenceId);
  }

  async markActiveDay(day: string): Promise<void> {
    await runInStore(this.databaseName, ACTIVE_DAYS_STORE, 'readwrite', (store) => store.put({ day }));
  }

  async activeDays(): Promise<string[]> {
    const rows = await runInStore(
      this.databaseName,
      ACTIVE_DAYS_STORE,
      'readonly',
      (store) => store.getAll() as IDBRequest<{ day: string }[]>,
    );
    return rows.map((row) => row.day);
  }

  async deleteForReference(referenceId: ReferenceId): Promise<void> {
    const db = await openDatabase(this.databaseName);
    const stores = [TAKE_SCORES_STORE, PRACTICE_LOG_STORE];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const name of stores) {
        const request = tx.objectStore(name).index(REFERENCE_ID_INDEX).openCursor(IDBKeyRange.only(referenceId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private byReference<T>(store: string, referenceId: ReferenceId): Promise<T[]> {
    return runInStore(
      this.databaseName,
      store,
      'readonly',
      (s) => s.index(REFERENCE_ID_INDEX).getAll(IDBKeyRange.only(referenceId)) as IDBRequest<T[]>,
    );
  }
}
