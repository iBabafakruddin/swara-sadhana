import type { RecordingRepository } from '@/application/ports';
import type { Recording, RecordingId } from '@/domain/recording/Recording';
import { EXPIRES_AT_INDEX, openDatabase, RECORDINGS_STORE as STORE, runInStore } from './database';

/** Keeps takes (including the audio Blob) in the browser's IndexedDB. Nothing leaves the device. */
export class IndexedDbRecordingRepository implements RecordingRepository {
  constructor(private readonly databaseName: string) {}

  async save(recording: Recording): Promise<void> {
    await this.run('readwrite', (store) => store.put(recording));
  }

  findAll(): Promise<Recording[]> {
    return this.run('readonly', (store) => store.getAll() as IDBRequest<Recording[]>);
  }

  findById(id: RecordingId): Promise<Recording | undefined> {
    return this.run('readonly', (store) => store.get(id) as IDBRequest<Recording | undefined>);
  }

  async delete(id: RecordingId): Promise<void> {
    await this.run('readwrite', (store) => store.delete(id));
  }

  async deleteExpired(now: number): Promise<number> {
    const db = await openDatabase(this.databaseName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).index(EXPIRES_AT_INDEX).openCursor(IDBKeyRange.upperBound(now));
      let removed = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        removed++;
        cursor.continue();
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return runInStore(this.databaseName, STORE, mode, operation);
  }
}
