import type { ReferenceRepository } from '@/application/ports';
import type { Reference, ReferenceId } from '@/domain/reference/Reference';
import { REFERENCES_STORE as STORE, runInStore } from './database';

/** Keeps reference vocals in the browser's IndexedDB, next to the takes. */
export class IndexedDbReferenceRepository implements ReferenceRepository {
  constructor(private readonly databaseName: string) {}

  async save(reference: Reference): Promise<void> {
    await this.run('readwrite', (store) => store.put(reference));
  }

  findAll(): Promise<Reference[]> {
    return this.run('readonly', (store) => store.getAll() as IDBRequest<Reference[]>);
  }

  findById(id: ReferenceId): Promise<Reference | undefined> {
    return this.run('readonly', (store) => store.get(id) as IDBRequest<Reference | undefined>);
  }

  async delete(id: ReferenceId): Promise<void> {
    await this.run('readwrite', (store) => store.delete(id));
  }

  private run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return runInStore(this.databaseName, STORE, mode, operation);
  }
}
