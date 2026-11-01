const DB_VERSION = 3;

export const RECORDINGS_STORE = 'recordings';
export const REFERENCES_STORE = 'references';
export const TAKE_SCORES_STORE = 'takeScores';
export const PRACTICE_LOG_STORE = 'practiceLog';
export const ACTIVE_DAYS_STORE = 'activeDays';
export const EXPIRES_AT_INDEX = 'expiresAt';
export const REFERENCE_ID_INDEX = 'referenceId';

const connections = new Map<string, Promise<IDBDatabase>>();

/** One shared connection per database name, so every repository sees the same schema. */
export function openDatabase(name: string): Promise<IDBDatabase> {
  let connection = connections.get(name);
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      // Bump DB_VERSION when adding a store. Creating whatever is missing (rather than branching on
      // oldVersion) also repairs a database that was created empty, e.g. by a devtools session.
      request.onupgradeneeded = () => {
        const db = request.result;
        const ensure = (store: string, keyPath: string, index?: [string, string]) => {
          if (db.objectStoreNames.contains(store)) return;
          const created = db.createObjectStore(store, { keyPath });
          if (index) created.createIndex(...index);
        };
        ensure(RECORDINGS_STORE, 'id', [EXPIRES_AT_INDEX, 'expiresAt']);
        ensure(REFERENCES_STORE, 'id');
        ensure(TAKE_SCORES_STORE, 'id', [REFERENCE_ID_INDEX, 'referenceId']);
        ensure(PRACTICE_LOG_STORE, 'id', [REFERENCE_ID_INDEX, 'referenceId']);
        ensure(ACTIVE_DAYS_STORE, 'day');
      };
      request.onsuccess = () => {
        // Let a newer version of the app, open in another tab, upgrade the schema.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
    connections.set(name, connection);
  }
  return connection;
}

/** Runs one request in its own transaction and resolves once the transaction commits. */
export async function runInStore<T>(
  databaseName: string,
  store: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase(databaseName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error);
  });
}
