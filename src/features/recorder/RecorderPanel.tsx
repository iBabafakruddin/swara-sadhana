import { useServices } from '@/app/ServicesProvider';
import type { CapturedAudio } from '@/application/ports';
import { formatDuration } from '@/shared/format';
import { LevelMeter } from './LevelMeter';
import { useRecorder } from './useRecorder';

const HINTS = {
  idle: 'Press record and start singing.',
  requesting: 'Waiting for microphone permission…',
  recording: 'Recording. Press stop when you finish the song.',
  saving: 'Saving your take…',
};

export function RecorderPanel({ onCaptured }: { onCaptured: (audio: CapturedAudio) => Promise<void> }) {
  const { recorderSupported } = useServices();
  const { status, elapsedMs, level, error, start, stop, discard } = useRecorder(onCaptured);
  const isRecording = status === 'recording';

  if (!recorderSupported) {
    return (
      <section className="panel recorder">
        <p role="alert" className="error">
          This browser can't record audio. Try a recent version of Chrome, Edge, Firefox or Safari.
        </p>
      </section>
    );
  }

  return (
    <section id="recorder" className="panel recorder" aria-label="Recorder">
      <button
        type="button"
        className={`record-button ${isRecording ? 'is-recording' : ''}`}
        onClick={() => void (isRecording ? stop() : start())}
        disabled={status === 'requesting' || status === 'saving'}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        <span className="record-icon" />
      </button>
      <div className="recorder-readout">
        <div className="timer" aria-live="off">
          {formatDuration(elapsedMs)}
        </div>
        <LevelMeter level={level} active={isRecording} />
        <p className="hint">{HINTS[status]}</p>
        {isRecording && (
          <button type="button" className="link-button" onClick={discard}>
            Discard this take
          </button>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
