import { useCallback, useState } from 'react';
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

/** Practice attempts for one take and reference; they survive closing and reopening the panel. */
export function usePractice(
  referenceId: ReferenceId,
  recordingId: RecordingId,
  keyOffsetSemitones: number,
): PracticeState {
  const { practice } = useServices();
  const [attempts, setAttempts] = useState(() => practice.attemptsFor(referenceId, recordingId));

  const addAttempt = useCallback(
    async (section: SegmentResult, audio: Blob) => {
      setAttempts(await practice.addAttempt({ referenceId, recordingId, section, keyOffsetSemitones, audio }));
    },
    [practice, referenceId, recordingId, keyOffsetSemitones],
  );

  return { attempts, addAttempt };
}
