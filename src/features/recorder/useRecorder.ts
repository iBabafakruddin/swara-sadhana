import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { AudioRecorder, CapturedAudio } from '@/application/ports';
import { describeMicrophoneError, errorMessage } from '@/shared/errors';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'saving';

export function useRecorder(onCaptured: (audio: CapturedAudio) => Promise<void>) {
  const { createRecorder } = useServices();
  const recorderRef = useRef<AudioRecorder | null>(null);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Drive the timer and level meter once per frame while recording.
  useEffect(() => {
    if (status !== 'recording') return;
    const startedAt = performance.now();
    let frame = 0;
    const tick = () => {
      setElapsedMs(performance.now() - startedAt);
      setLevel(recorderRef.current?.getInputLevel() ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  // Release the microphone if the component goes away mid-take.
  useEffect(() => () => recorderRef.current?.cancel(), []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('requesting');
    const recorder = createRecorder();
    try {
      await recorder.start();
      recorderRef.current = recorder;
      setElapsedMs(0);
      setStatus('recording');
    } catch (e) {
      recorder.cancel();
      setError(describeMicrophoneError(e));
      setStatus('idle');
    }
  }, [createRecorder]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    setStatus('saving');
    setLevel(0);
    try {
      await onCaptured(await recorder.stop());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStatus('idle');
    }
  }, [onCaptured]);

  const discard = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setLevel(0);
    setStatus('idle');
  }, []);

  return { status, elapsedMs, level, error, start, stop, discard };
}
