import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { PlaybackHandle } from '@/application/ports';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import type { SegmentResult } from '@/domain/comparison/compareTakes';
import { describeSegment } from '@/domain/comparison/feedback';
import { isPassingAttempt, sectionProgress, type PracticeAttempt } from '@/domain/practice/practiceProgress';
import { PitchChart } from '@/features/analysis/PitchChart';
import { formatDateTime } from '@/shared/format';
import { playRange } from '@/shared/playRange';
import { useObjectUrl } from '@/shared/useObjectUrl';
import { useAttemptRecorder, type PlayAlong } from './useAttemptRecorder';

const CONTEXT_SEC = 0.3;

interface Props {
  section: SegmentResult;
  referenceTrack: PitchTrack;
  keyOffsetSemitones: number;
  referenceAudioRef: RefObject<HTMLAudioElement>;
  /** Attempts at this section only, oldest first. */
  attempts: PracticeAttempt[];
  onAttempt(audio: Blob): Promise<void>;
  onClose(): void;
}

type Listen = 'reference' | 'guide';

/** Drill one section: listen (slowed down, looped, or as a plain tone), sing it, see the score, repeat. */
export function PracticePanel({
  section,
  referenceTrack,
  keyOffsetSemitones,
  referenceAudioRef,
  attempts,
  onAttempt,
  onClose,
}: Props) {
  const { config, tonePlayer, practice } = useServices();
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playAlong, setPlayAlong] = useState<PlayAlong>('none');
  const [listening, setListening] = useState<Listen | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const recorder = useAttemptRecorder(onAttempt);

  // The reference melody moved into the singer's key, for the guide tone and the live chart.
  const guideTrack = useMemo(() => {
    const shift = 2 ** (keyOffsetSemitones / 12);
    return referenceTrack.map((p) => ({ ...p, frequencyHz: p.frequencyHz === null ? null : p.frequencyHz * shift }));
  }, [referenceTrack, keyOffsetSemitones]);
  const chartStart = section.reference.startSec - CONTEXT_SEC;
  const chartEnd = section.reference.endSec + CONTEXT_SEC;
  const guideInView = useMemo(
    () => guideTrack.filter((p) => p.timeSec >= chartStart && p.timeSec <= chartEnd),
    [guideTrack, chartStart, chartEnd],
  );

  const stopListening = () => {
    const playback = playbackRef.current;
    playbackRef.current = null;
    playback?.stop();
    setListening(null);
  };
  useEffect(() => () => playbackRef.current?.stop(), []);

  const listen = async (what: Listen) => {
    stopListening();
    setListening(what);
    const { startSec, endSec } = section.reference;
    for (;;) {
      const playback =
        what === 'reference' && referenceAudioRef.current
          ? playRange(referenceAudioRef.current, startSec - CONTEXT_SEC, endSec + CONTEXT_SEC, rate)
          : tonePlayer.playMelody(guideTrack, section.reference, rate);
      playbackRef.current = playback;
      await playback.done;
      // Stop unless looping and nothing else has taken over.
      if (!loopRef.current || playbackRef.current !== playback) break;
    }
    if (playbackRef.current && !loopRef.current) {
      playbackRef.current = null;
      setListening(null);
    }
  };

  const sing = () => {
    stopListening();
    void recorder.start({
      section: section.reference,
      rate,
      playAlong,
      referenceAudio: referenceAudioRef.current,
      guideTrack,
    });
  };

  const progress = sectionProgress(attempts, practice.rules);
  const busy = recorder.phase !== 'idle';
  const latest = attempts.at(-1);

  return (
    <div className="practice" aria-label={`Practise section ${section.index + 1}`}>
      <div className="practice-header">
        <strong>Practise section {section.index + 1}</strong>
        <span className={`practice-progress ${progress.passed ? 'is-passed' : ''}`}>
          {progress.passed
            ? 'Learned ✓'
            : `${progress.currentRun} of ${practice.rules.passesInARow} passing attempts in a row (score ${practice.rules.passScore}+)`}
        </span>
        <span className="spacer" />
        <button type="button" className="link-button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>

      <div className="practice-step">
        <span className="step-label">1. Listen</span>
        <label className="speed">
          Speed
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} disabled={busy}>
            {config.practice.speeds.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
        </label>
        {(['reference', 'guide'] as const).map((what) => (
          <button
            key={what}
            type="button"
            className="button"
            aria-pressed={listening === what}
            disabled={busy}
            onClick={() => void (listening === what ? stopListening() : listen(what))}
          >
            {listening === what ? 'Stop' : what === 'reference' ? 'Hear reference' : 'Hear guide tone'}
          </button>
        ))}
      </div>

      <div className="practice-step">
        <span className="step-label">2. Sing</span>
        <label className="speed">
          While you sing
          <select value={playAlong} onChange={(e) => setPlayAlong(e.target.value as PlayAlong)} disabled={busy}>
            <option value="none">Silence (listen first)</option>
            <option value="reference">Reference (headphones)</option>
            <option value="guide">Guide tone (headphones)</option>
          </select>
        </label>
        {recorder.phase === 'recording' ? (
          <button type="button" className="button button-primary" onClick={() => void recorder.finish()}>
            Done
          </button>
        ) : (
          <button type="button" className="button button-primary" onClick={sing} disabled={busy}>
            {latest ? 'Sing it again' : 'Sing it'}
          </button>
        )}
        {(recorder.phase === 'countIn' || recorder.phase === 'starting') && (
          <button type="button" className="link-button" onClick={recorder.cancel}>
            Cancel
          </button>
        )}
        <span className="practice-status" aria-live="polite">
          {recorder.phase === 'starting' && 'Opening the microphone…'}
          {recorder.phase === 'countIn' && <span className="count-in">{recorder.beat || 'Go'}</span>}
          {recorder.phase === 'recording' && 'Sing now'}
          {recorder.phase === 'scoring' && 'Scoring…'}
        </span>
      </div>
      {playAlong !== 'none' && (
        <p className="hint">Use headphones: if the microphone hears the reference or tone, the score will be wrong.</p>
      )}
      {rate !== 1 && <p className="hint">Singing it slowly is fine: attempts are scored on pitch, not speed.</p>}

      <PitchChart
        track={recorder.liveTrack}
        guideTrack={guideInView}
        startSec={chartStart}
        durationSec={chartEnd}
        currentTimeSec={recorder.liveTrack.at(-1)?.timeSec ?? chartStart}
        onSeek={() => {}}
      />

      {recorder.error && (
        <p role="alert" className="error">
          {recorder.error}
        </p>
      )}

      {attempts.length > 0 && (
        <ol className="attempt-list" reversed>
          {[...attempts].reverse().map((attempt, k) => (
            <AttemptRow key={attempt.id} attempt={attempt} number={attempts.length - k} />
          ))}
        </ol>
      )}
    </div>
  );
}

function AttemptRow({ attempt, number }: { attempt: PracticeAttempt; number: number }) {
  const { practice } = useServices();
  const notes = describeSegment(attempt.result);
  const passed = isPassingAttempt(attempt, practice.rules);

  return (
    <li className="attempt">
      <span className={`segment-score ${passed ? 'score-good' : 'score-poor'}`}>{attempt.result.score}</span>
      <span className="attempt-label">Attempt {number}</span>
      <span className="attempt-notes">{notes.length ? notes.join(' ') : 'Good match.'}</span>
      {attempt.audio ? (
        <AttemptPlayer audio={attempt.audio} />
      ) : (
        <span className="muted attempt-saved" title="Attempts from earlier sessions keep only their scores">
          {formatDateTime(attempt.createdAt)}
        </span>
      )}
    </li>
  );
}

function AttemptPlayer({ audio }: { audio: Blob }) {
  const url = useObjectUrl(audio);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) {
      element.currentTime = 0;
      void element.play();
    } else {
      element.pause();
    }
  };

  return (
    <>
      <button type="button" className="button" aria-pressed={playing} onClick={toggle}>
        {playing ? 'Stop' : 'Play'}
      </button>
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        hidden
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}
