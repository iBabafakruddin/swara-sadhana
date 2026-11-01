import { useEffect, useRef, useState } from 'react';
import type { Recording, RecordingId } from '@/domain/recording/Recording';
import type { Reference } from '@/domain/reference/Reference';
import { timeRemainingMs } from '@/domain/recording/retention';
import { PitchPanel } from '@/features/analysis/PitchPanel';
import { ComparePanel } from '@/features/compare/ComparePanel';
import { formatBytes, formatDateTime, formatDuration, formatTimeRemaining } from '@/shared/format';
import { useObjectUrl } from '@/shared/useObjectUrl';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25];
const EXPIRY_WARNING_MS = 60 * 60 * 1000;

interface Props {
  recording: Recording;
  references: Reference[];
  now: number;
  onRename(id: RecordingId, title: string): Promise<void>;
  onDelete(id: RecordingId): Promise<void>;
  onExport(id: RecordingId): Promise<void>;
}

type Panel = 'pitch' | 'compare' | null;

export function RecordingCard({ recording, references, now, onRename, onDelete, onExport }: Props) {
  const audioUrl = useObjectUrl(recording.audio);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [title, setTitle] = useState(recording.title);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));

  useEffect(() => setTitle(recording.title), [recording.title]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Set both: playbackRate resets to defaultPlaybackRate whenever a new source loads.
    audio.defaultPlaybackRate = playbackRate;
    audio.playbackRate = playbackRate;
  }, [playbackRate, audioUrl]);

  const remaining = timeRemainingMs(recording, now);

  const commitTitle = () => {
    if (title.trim() && title !== recording.title) void onRename(recording.id, title);
    else setTitle(recording.title);
  };

  const confirmDelete = () => {
    if (window.confirm(`Delete "${recording.title}"? This can't be undone.`)) void onDelete(recording.id);
  };

  const seek = (timeSec: number) => {
    if (audioRef.current) audioRef.current.currentTime = timeSec;
  };

  return (
    <article className="take">
      <header className="take-header">
        <input
          className="take-title"
          value={title}
          aria-label="Take name"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className={`expiry ${remaining < EXPIRY_WARNING_MS ? 'expiry-soon' : ''}`}>
          Deletes in {formatTimeRemaining(remaining)}
        </span>
      </header>
      <p className="take-meta">
        {formatDateTime(recording.createdAt)} · {formatDuration(recording.durationMs)} ·{' '}
        {formatBytes(recording.sizeBytes)}
      </p>

      <audio
        ref={audioRef}
        className="take-audio"
        src={audioUrl}
        controls
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
      />

      <div className="take-actions">
        <label className="speed">
          Speed
          <select value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))}>
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button" aria-pressed={panel === 'pitch'} onClick={() => toggle('pitch')}>
          {panel === 'pitch' ? 'Hide pitch' : 'Show pitch'}
        </button>
        <button type="button" className="button" aria-pressed={panel === 'compare'} onClick={() => toggle('compare')}>
          {panel === 'compare' ? 'Hide comparison' : 'Compare'}
        </button>
        <span className="spacer" />
        <button type="button" className="button button-primary" onClick={() => void onExport(recording.id)}>
          Save to device
        </button>
        <button type="button" className="button button-danger" onClick={confirmDelete}>
          Delete
        </button>
      </div>

      {panel === 'pitch' && (
        <PitchPanel
          audio={recording.audio}
          durationSec={recording.durationMs / 1000}
          currentTimeSec={currentTimeSec}
          onSeek={seek}
        />
      )}
      {panel === 'compare' && (
        <ComparePanel
          recordingId={recording.id}
          references={references}
          takeAudioRef={audioRef}
          durationSec={recording.durationMs / 1000}
          currentTimeSec={currentTimeSec}
          onSeek={seek}
        />
      )}
    </article>
  );
}
