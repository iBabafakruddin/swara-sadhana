import { PitchChart } from './PitchChart';
import { usePitchAnalysis } from './usePitchAnalysis';

interface Props {
  audio: Blob;
  durationSec: number;
  currentTimeSec: number;
  onSeek(timeSec: number): void;
}

export function PitchPanel({ audio, durationSec, currentTimeSec, onSeek }: Props) {
  const analysis = usePitchAnalysis(audio);

  if (analysis.status === 'loading') return <p className="muted pitch-status">Analysing pitch…</p>;
  if (analysis.status === 'error') {
    return (
      <p role="alert" className="error pitch-status">
        Couldn't analyse this take: {analysis.message}
      </p>
    );
  }
  if (!analysis.summary) return <p className="muted pitch-status">No clear singing was detected in this take.</p>;

  const { summary, track } = analysis;
  return (
    <div className="pitch-panel">
      <dl className="pitch-stats">
        <div>
          <dt>Range</dt>
          <dd>
            {summary.lowestNote} – {summary.highestNote}
          </dd>
        </div>
        <div>
          <dt>Most sung</dt>
          <dd>{summary.mostSungNote}</dd>
        </div>
        <div>
          <dt>Avg. off-pitch</dt>
          <dd>{summary.averageCentsOff} cents</dd>
        </div>
        <div>
          <dt>Voiced</dt>
          <dd>{Math.round(summary.voicedRatio * 100)}%</dd>
        </div>
      </dl>
      <PitchChart track={track} durationSec={durationSec} currentTimeSec={currentTimeSec} onSeek={onSeek} />
      <p className="hint">Click the chart to jump to that moment. Lines between notes mean you were off-pitch.</p>
    </div>
  );
}
