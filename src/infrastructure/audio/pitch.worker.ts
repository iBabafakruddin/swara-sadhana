import { analyzePitchTrack, type PitchTrack, type PitchTrackOptions } from '@/domain/analysis/pitchDetection';

export interface PitchJob {
  id: number;
  samples: Float32Array;
  sampleRate: number;
  options: PitchTrackOptions;
}

export type PitchJobResult = { id: number; track: PitchTrack } | { id: number; error: string };

// Typed loosely so this file doesn't need the WebWorker lib alongside DOM.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PitchJob>) => void) | null;
  postMessage(message: PitchJobResult): void;
};

scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({ id: data.id, track: analyzePitchTrack(data.samples, data.sampleRate, data.options) });
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
