import type { Reference } from '@/domain/reference/Reference';
import { RecordingCard } from './RecordingCard';
import type { RecordingLibrary } from './useRecordings';

export function RecordingList({ library, references }: { library: RecordingLibrary; references: Reference[] }) {
  const { items, loading, error, now } = library;

  return (
    <section className="library" aria-labelledby="library-heading">
      <h2 id="library-heading">Your takes</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No takes yet. Press record and sing.</p>
      ) : (
        <ul className="take-list">
          {items.map((recording) => (
            <li key={recording.id}>
              <RecordingCard
                recording={recording}
                references={references}
                now={now}
                onRename={library.rename}
                onDelete={library.remove}
                onExport={library.exportToDevice}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
