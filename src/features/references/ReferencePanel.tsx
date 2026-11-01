import { useEffect, useState, type ChangeEvent } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { Reference, ReferenceId } from '@/domain/reference/Reference';
import { JourneyPanel } from '@/features/progress/JourneyPanel';
import { useRecorder } from '@/features/recorder/useRecorder';
import { formatBytes, formatDuration } from '@/shared/format';
import { useObjectUrl } from '@/shared/useObjectUrl';
import type { ReferenceLibrary } from './useReferences';

export function ReferencePanel({ library }: { library: ReferenceLibrary }) {
  const { recorderSupported } = useServices();
  const recorder = useRecorder(library.addRecording);
  const [importing, setImporting] = useState(false);
  const isRecording = recorder.status === 'recording';

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    await library.importFile(file);
    setImporting(false);
  };

  return (
    <section className="panel references" aria-labelledby="references-heading">
      <h2 id="references-heading">Reference vocals</h2>
      <p className="hint">
        Add the line or song you're learning, sung clearly with no background music (an instrument-free vocal
        or your teacher's recording). Then use <strong>Compare</strong> on a take to see where to improve.
        References stay until you delete them.
      </p>

      <div className="reference-actions">
        <label className={`button button-primary file-button ${importing ? 'is-busy' : ''}`}>
          {importing ? 'Adding…' : 'Upload audio file'}
          <input type="file" accept="audio/*" onChange={(e) => void handleFile(e)} disabled={importing} />
        </label>
        {recorderSupported && (
          <button
            type="button"
            className="button"
            aria-pressed={isRecording}
            disabled={recorder.status === 'requesting' || recorder.status === 'saving'}
            onClick={() => void (isRecording ? recorder.stop() : recorder.start())}
          >
            {isRecording ? `Stop and save (${formatDuration(recorder.elapsedMs)})` : 'Record a reference'}
          </button>
        )}
        {isRecording && (
          <button type="button" className="link-button" onClick={recorder.discard}>
            Discard
          </button>
        )}
      </div>

      {(library.error || recorder.error) && (
        <p role="alert" className="error">
          {library.error ?? recorder.error}
        </p>
      )}

      {library.loading ? null : library.items.length === 0 ? (
        <p className="empty">No references yet.</p>
      ) : (
        <ul className="reference-list">
          {library.items.map((reference) => (
            <li key={reference.id}>
              <ReferenceItem reference={reference} onRename={library.rename} onDelete={library.remove} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ItemProps {
  reference: Reference;
  onRename(id: ReferenceId, title: string): Promise<void>;
  onDelete(id: ReferenceId): Promise<void>;
}

function ReferenceItem({ reference, onRename, onDelete }: ItemProps) {
  const audioUrl = useObjectUrl(reference.audio);
  const [title, setTitle] = useState(reference.title);
  const [showJourney, setShowJourney] = useState(false);
  useEffect(() => setTitle(reference.title), [reference.title]);

  const commitTitle = () => {
    if (title.trim() && title !== reference.title) void onRename(reference.id, title);
    else setTitle(reference.title);
  };

  const confirmDelete = () => {
    if (window.confirm(`Delete the reference "${reference.title}" and its progress history?`)) void onDelete(reference.id);
  };

  return (
    <div className="reference-item">
      <div className="reference-header">
        <input
          className="take-title"
          value={title}
          aria-label="Reference name"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="take-meta">
          {reference.source === 'upload' ? 'Uploaded' : 'Recorded'}
          {reference.durationMs > 0 && ` · ${formatDuration(reference.durationMs)}`} · {formatBytes(reference.sizeBytes)}
        </span>
        <button type="button" className="button" aria-pressed={showJourney} onClick={() => setShowJourney((v) => !v)}>
          {showJourney ? 'Hide progress' : 'Progress'}
        </button>
        <button type="button" className="button button-danger" onClick={confirmDelete}>
          Delete
        </button>
      </div>
      <audio className="take-audio" src={audioUrl} controls preload="metadata" />
      {showJourney && <JourneyPanel referenceId={reference.id} />}
    </div>
  );
}
