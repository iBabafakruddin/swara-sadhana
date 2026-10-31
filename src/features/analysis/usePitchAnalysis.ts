import { useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import { summarizePitch, type PitchSummary } from '@/domain/analysis/pitchSummary';
import { errorMessage } from '@/shared/errors';

export type PitchAnalysisState =
  | { status: 'loading' }
  | { status: 'ready'; track: PitchTrack; summary: PitchSummary | null }
  | { status: 'error'; message: string };

export function usePitchAnalysis(audio: Blob): PitchAnalysisState {
  const { pitchAnalyzer } = useServices();
  const [state, setState] = useState<PitchAnalysisState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    pitchAnalyzer.analyze(audio).then(
      (track) => !cancelled && setState({ status: 'ready', track, summary: summarizePitch(track) }),
      (error) => !cancelled && setState({ status: 'error', message: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [audio, pitchAnalyzer]);

  return state;
}
