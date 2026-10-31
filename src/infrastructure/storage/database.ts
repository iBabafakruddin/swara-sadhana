const DB_VERSION = 2;

export const RECORDINGS_STORE = 'recordings';
export const REFERENCES_STORE = 'references';
export const EXPIRES_AT_INDEX = 'expiresAt';

const connections = new Map<string, Promise<IDBDatabase>>();

/** One shared connection per database name, so every repository sees the same schema. */
export function openDatabase(name: string): Promise<IDBDatabase> {
  let connection = connections.get(name);
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      // Bump DB_VERSION and add a branch on event.oldVersion when the schema changes.
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (event.oldVersion < 1) {
          const recordings = db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
          recordings.createIndex(EXPIRES_AT_INDEX, 'expiresAt');
        }
        if (event.oldVersion < 2) db.createObjectStore(REFERENCES_STORE, { keyPath: 'id' });
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
