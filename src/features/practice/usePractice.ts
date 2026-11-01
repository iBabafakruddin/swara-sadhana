import { useCallback, useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { SegmentResult } from '@/domain/comparison/compareTakes';
import type { PracticeAttempt } from '@/domain/practice/practiceProgress';
import type { RecordingId } from '@/domain/recording/Recording';
import type { ReferenceId } from '@/domain/reference/Reference';

export interface PracticeState {
  attempts: PracticeAttempt[];
  /** Scores an attempt; rejects with a readable message when it can't be scored. */
  addAttempt(section: SegmentResult, audio: Blob): Promise<void>;
}

/** Practice attempts for one take and reference, including ones saved in earlier sessions. */
export function usePractice(
  referenceId: ReferenceId,
  recordingId: RecordingId,
  keyOffsetSemitones: number,
): PracticeState {
  const { practice } = useServices();
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);

  useEffect(() => {
    let cancelled = false;
    // History is a nice-to-have here; practice still works if it can't be read.
    practice.attemptsFor(referenceId, recordingId).then(
      (saved) => !cancelled && setAttempts(saved),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [practice, referenceId, recordingId]);

  const addAttempt = useCallback(
    async (section: SegmentResult, audio: Blob) => {
      setAttempts(await practice.addAttempt({ referenceId, recordingId, section, keyOffsetSemitones, audio }));
    },
    [practice, referenceId, recordingId, keyOffsetSemitones],
  );

  return { attempts, addAttempt };
}
