import { useEffect, useRef, useState, type RefObject } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { Comparison } from '@/application/ComparisonService';
import type { SegmentResult, TimeRange } from '@/domain/comparison/compareTakes';
import { describeKeyOffset, describeSegment, scoreBand } from '@/domain/comparison/feedback';
import { readyForFullTake, sectionProgress } from '@/domain/practice/practiceProgress';
import type { RecordingId } from '@/domain/recording/Recording';
import type { Reference } from '@/domain/reference/Reference';
import { PitchChart } from '@/features/analysis/PitchChart';
import { PracticePanel } from '@/features/practice/PracticePanel';
import { usePractice } from '@/features/practice/usePractice';
import { formatDuration } from '@/shared/format';
import { playRange, type RangePlayback } from '@/shared/playRange';
import { useObjectUrl } from '@/shared/useObjectUrl';
import { useComparison } from './useComparison';

/** A little audio either side of a section, so it doesn't start or stop mid-breath. */
const CONTEXT_SEC = 0.3;

interface Props {
  recordingId: RecordingId;
  references: Reference[];
  takeAudioRef: RefObject<HTMLAudioElement>;
  durationSec: number;
  currentTimeSec: number;
  onSeek(timeSec: number): void;
}

type ViewProps = Omit<Props, 'references'> & { reference: Reference };

export function ComparePanel({ references, ...rest }: Props) {
  const [chosenId, setChosenId] = useState<string>();
  const reference = references.find((r) => r.id === chosenId) ?? references[0];

  if (!reference) {
    return <p className="muted compare-status">Add a reference vocal above, then compare this take with it.</p>;
  }

  return (
    <div className="compare-panel">
      <label className="speed">
        Compare with
        <select value={reference.id} onChange={(e) => setChosenId(e.target.value)}>
          {references.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <CompareResult key={reference.id} reference={reference} {...rest} />
    </div>
  );
}

function CompareResult(props: ViewProps) {
  const state = useComparison(props.reference.id, props.recordingId);

  if (state.status === 'loading') {
    return (
      <p className="muted compare-status">Comparing with "{props.reference.title}"… Long songs take a few seconds.</p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="error compare-status">
        Couldn't compare: {state.message}
      </p>
    );
  }
  return <ComparisonView {...props} comparison={state.comparison} />;
}

type Listen = 'reference' | 'mine' | 'both';

function ComparisonView({
  reference,
  recordingId,
  takeAudioRef,
  durationSec,
  currentTimeSec,
  onSeek,
  comparison,
}: ViewProps & { comparison: Comparison }) {
  const { config, practice: practiceService } = useServices();
  const { report, takeTrack, referenceTrack, outcome } = comparison;
  const practice = usePractice(reference.id, recordingId, report.keyOffsetSemitones);
  const referenceUrl = useObjectUrl(reference.audio);
  const referenceAudioRef = useRef<HTMLAudioElement>(null);
  const playbackRef = useRef<RangePlayback | null>(null);
  const [playing, setPlaying] = useState<{ segment: number; listen: Listen } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [practising, setPractising] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  // The take recorded just before this one, if it was compared with the same reference.
  const before = outcome?.previous?.sectionScores.length === report.segments.length ? outcome.previous : null;

  const stop = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setPlaying(null);
  };
  // Stop section playback when the panel closes.
  useEffect(() => () => playbackRef.current?.stop(), []);

  const playPart = async (audio: HTMLAudioElement | null, range: TimeRange) => {
    if (!audio) return false;
    const playback = playRange(audio, range.startSec - CONTEXT_SEC, range.endSec + CONTEXT_SEC);
    playbackRef.current = playback;
    await playback.done;
    // Carry on only if nothing else took over in the meantime.
    return playbackRef.current === playback;
  };

  const listen = async (segment: SegmentResult, what: Listen) => {
    stop();
    setSelected(segment.index);
    setPlaying({ segment: segment.index, listen: what });
    let finished = true;
    if (what !== 'mine') finished = await playPart(referenceAudioRef.current, segment.reference);
    if (finished && what !== 'reference') finished = await playPart(takeAudioRef.current, segment.take);
    if (finished) {
      playbackRef.current = null;
      setPlaying(null);
    }
  };

  const startPractice = (segment: SegmentResult) => {
    stop();
    setSelected(segment.index);
    setPractising(segment.index);
  };

  const weak = report.segments.filter((s) => s.needsWork);
  const shown = showAll ? report.segments : weak;
  const keyNote = describeKeyOffset(report.keyOffsetSemitones);
  const band = (score: number) => scoreBand(score, config.comparison.scoring.passScore);
  const rules = practiceService.rules;
  const ready = readyForFullTake(
    weak.map((s) => s.index),
    practice.attempts,
    rules,
  );

  return (
    <div className="compare-result">
      <audio ref={referenceAudioRef} src={referenceUrl} preload="auto" hidden />

      <div className="compare-summary">
        <div className={`score score-${band(report.overallScore)} ${outcome?.isPersonalBest ? 'is-best' : ''}`}>
          <span className="score-value">{report.overallScore}</span>
          <span className="score-label">match</span>
        </div>
        <div>
          <p className="compare-headline">
            {weak.length === 0
              ? 'Every section matched the reference.'
              : `${weak.length} of ${report.segments.length} sections need work.`}
          </p>
          {outcome?.isPersonalBest && (
            <p className="personal-best" role="status">
              <span aria-hidden="true">✦</span> Your best take of this song so far! Previous best: {outcome.bestBefore}.
            </p>
          )}
          {before && (
            <p className="hint">
              Previous take: {before.overallScore} → now {report.overallScore}{' '}
              <Change from={before.overallScore} to={report.overallScore} />
            </p>
          )}
          {keyNote && <p className="hint">{keyNote}</p>}
        </div>
      </div>

      {ready && (
        <div className="ready-banner" role="status">
          <span>
            {weak.length === 1 ? "You've learned the weak section." : `You've learned all ${weak.length} weak sections.`}{' '}
            Record the full song again to see how it comes together.
          </span>
          <button
            type="button"
            className="button button-primary"
            onClick={() => document.getElementById('recorder')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Record a full take
          </button>
        </div>
      )}

      <PitchChart
        track={takeTrack}
        guideTrack={report.guideOnTake}
        highlights={weak.map((s) => ({ key: s.index, ...s.take, selected: s.index === selected }))}
        durationSec={durationSec}
        currentTimeSec={currentTimeSec}
        onSeek={onSeek}
      />
      <p className="hint chart-legend">
        <span className="legend-swatch legend-you" /> You <span className="legend-swatch legend-guide" /> Reference, in
        your key and timing <span className="legend-swatch legend-weak" /> Needs work
      </p>

      {shown.length > 0 && (
        <ol className="segment-list">
          {shown.map((segment) => {
            const notes = describeSegment(segment);
            const sectionAttempts = practice.attempts.filter((a) => a.sectionIndex === segment.index);
            const progress = sectionProgress(sectionAttempts, rules);
            const wasScore = before?.sectionScores[segment.index];
            const isPlaying = (what: Listen) => playing?.segment === segment.index && playing.listen === what;
            const button = (what: Listen, label: string) => (
              <button
                type="button"
                className="button"
                aria-pressed={isPlaying(what)}
                onClick={() => void (isPlaying(what) ? stop() : listen(segment, what))}
              >
                {isPlaying(what) ? 'Stop' : label}
              </button>
            );
            return (
              <li
                key={segment.index}
                className={`segment ${segment.index === selected ? 'is-selected' : ''}`}
                onClick={() => setSelected(segment.index)}
              >
                <div className="segment-header">
                  <span className={`segment-score score-${band(segment.score)}`}>{segment.score}</span>
                  <strong>Section {segment.index + 1}</strong>
                  <span className="muted">
                    {formatDuration(segment.take.startSec * 1000)}–{formatDuration(segment.take.endSec * 1000)}
                  </span>
                  {wasScore !== undefined && (
                    <span className="muted">
                      was {wasScore} <Change from={wasScore} to={segment.score} />
                    </span>
                  )}
                  {progress.passed ? (
                    <span className="chip chip-good">Learned ✓</span>
                  ) : sectionAttempts.length > 0 ? (
                    <span className="chip">
                      {sectionAttempts.length} attempt{sectionAttempts.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                {notes.length > 0 ? (
                  <ul className="segment-notes">
                    {notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="segment-notes muted">Good match.</p>
                )}
                {practising === segment.index ? (
                  <PracticePanel
                    section={segment}
                    referenceTrack={referenceTrack}
                    keyOffsetSemitones={report.keyOffsetSemitones}
                    referenceAudioRef={referenceAudioRef}
                    attempts={sectionAttempts}
                    onAttempt={(audio) => practice.addAttempt(segment, audio)}
                    onClose={() => setPractising(null)}
                  />
                ) : (
                  <div className="segment-actions">
                    <button type="button" className="button button-primary" onClick={() => startPractice(segment)}>
                      Practise
                    </button>
                    {button('reference', 'Hear reference')}
                    {button('mine', 'Hear mine')}
                    {button('both', 'Reference, then mine')}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {report.segments.length > weak.length && (
        <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show only sections that need work' : `Show all ${report.segments.length} sections`}
        </button>
      )}
    </div>
  );
}

function Change({ from, to }: { from: number; to: number }) {
  const change = to - from;
  if (change === 0) return <span className="change">(no change)</span>;
  return (
    <span className={`change ${change > 0 ? 'change-up' : 'change-down'}`}>
      ({change > 0 ? '+' : ''}
      {change})
    </span>
  );
}
