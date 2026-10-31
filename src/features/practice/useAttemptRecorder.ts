import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { AudioRecorder, PlaybackHandle } from '@/application/ports';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import type { TimeRange } from '@/domain/comparison/compareTakes';
import { describeMicrophoneError, errorMessage } from '@/shared/errors';
import { playRange } from '@/shared/playRange';

export type AttemptPhase = 'idle' | 'starting' | 'countIn' | 'recording' | 'scoring';

/** Live pitch is sampled on a timer (~30 per second); animation frames stop in background tabs. */
const LIVE_PITCH_INTERVAL_MS = 33;

/** What plays while the singer sings. Anything but 'none' needs headphones, or the mic hears it. */
export type PlayAlong = 'none' | 'reference' | 'guide';

export interface AttemptSetup {
  /** The section on the reference's timeline. */
  section: TimeRange;
  rate: number;
  playAlong: PlayAlong;
  referenceAudio: HTMLAudioElement | null;
  /** The reference melody in the singer's key, for the guide tone. */
  guideTrack: PitchTrack;
}

/**
 * Records one attempt at a section: count-in, then record with live pitch for as long as the
 * section lasts (at the chosen speed), then hands the audio over to be scored.
 */
export function useAttemptRecorder(onRecorded: (audio: Blob) => Promise<void>) {
  const { createRecorder, tonePlayer, config } = useServices();
  const [phase, setPhase] = useState<AttemptPhase>('idle');
  const [beat, setBeat] = useState(0);
  const [liveTrack, setLiveTrack] = useState<PitchTrack>([]);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const sampleTimerRef = useRef(0);
  const stopTimerRef = useRef(0);
  // Bumped on every start or cancel, so a stale async step can tell it should stop.
  const runRef = useRef(0);

  const cleanUp = useCallback(() => {
    window.clearInterval(sampleTimerRef.current);
    window.clearTimeout(stopTimerRef.current);
    playbackRef.current?.stop();
    playbackRef.current = null;
  }, []);

  const finish = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    cleanUp();
    setPhase('scoring');
    try {
      const captured = await recorder.stop();
      await onRecorded(captured.blob);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPhase('idle');
    }
  }, [cleanUp, onRecorded]);

  const cancel = useCallback(() => {
    runRef.current++;
    cleanUp();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setPhase('idle');
  }, [cleanUp]);

  // Release the microphone and stop any sound if the panel closes mid-attempt.
  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    async (setup: AttemptSetup) => {
      const run = ++runRef.current;
      setError(null);
      setLiveTrack([]);
      setPhase('starting');

      const recorder = createRecorder();
      try {
        // Open the microphone first, so permission prompts and warm-up happen before the count-in.
        await recorder.start();
      } catch (e) {
        recorder.cancel();
        setError(describeMicrophoneError(e));
        setPhase('idle');
        return;
      }
      if (run !== runRef.current) return recorder.cancel();
      recorderRef.current = recorder;

      const { countInBeats, countInIntervalSec, graceSec } = config.practice;
      setPhase('countIn');
      // Counts down to 0 ("Go") on the last, higher click.
      setBeat(countInBeats - 1);
      const countIn = tonePlayer.countIn(countInBeats, countInIntervalSec);
      playbackRef.current = countIn;
      const ticker = window.setInterval(() => setBeat((b) => Math.max(0, b - 1)), countInIntervalSec * 1000);
      await countIn.done;
      window.clearInterval(ticker);
      if (run !== runRef.current) return;

      const { section, rate } = setup;
      if (setup.playAlong === 'reference' && setup.referenceAudio) {
        playbackRef.current = playRange(setup.referenceAudio, section.startSec, section.endSec, rate);
      } else if (setup.playAlong === 'guide') {
        playbackRef.current = tonePlayer.playMelody(setup.guideTrack, section, rate);
      } else {
        playbackRef.current = null;
      }

      setPhase('recording');
      const startedAt = performance.now();
      const stopAfterSec = (section.endSec - section.startSec) / rate + graceSec;
      stopTimerRef.current = window.setTimeout(() => void finish(), stopAfterSec * 1000);
      sampleTimerRef.current = window.setInterval(() => {
        const elapsedSec = (performance.now() - startedAt) / 1000;
        const point = { timeSec: section.startSec + elapsedSec * rate, frequencyHz: recorder.getLivePitchHz() };
        setLiveTrack((track) => [...track, point]);
      }, LIVE_PITCH_INTERVAL_MS);
    },
    [config.practice, createRecorder, finish, tonePlayer],
  );

  return { phase, beat, liveTrack, error, start, finish, cancel };
}
