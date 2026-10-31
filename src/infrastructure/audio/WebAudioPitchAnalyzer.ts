import type { PitchAnalyzer } from '@/application/ports';
import { analyzePitchTrack, type PitchTrack, type PitchTrackOptions } from '@/domain/analysis/pitchDetection';
import type { PitchJob, PitchJobResult } from './pitch.worker';

export interface WebAudioPitchAnalyzerOptions extends PitchTrackOptions {
  analysisSampleRate: number;
}

/**
 * Decodes audio with the Web Audio API (only available on the main thread), then runs pitch
 * detection in a Web Worker so long songs don't freeze the page. Falls back to the main thread
 * where workers aren't available.
 */
export class WebAudioPitchAnalyzer implements PitchAnalyzer {
  private worker: Worker | null = null;
  private nextJobId = 0;
  private readonly pending = new Map<number, { resolve(track: PitchTrack): void; reject(error: Error): void }>();

  constructor(private readonly options: WebAudioPitchAnalyzerOptions) {}

  async analyze(audio: Blob): Promise<PitchTrack> {
    // decodeAudioData resamples to the context's rate, so this also downsamples for speed.
    const context = new OfflineAudioContext(1, 1, this.options.analysisSampleRate);
    const buffer = await context.decodeAudioData(await audio.arrayBuffer());
    const samples = buffer.getChannelData(0);

    const worker = this.getWorker();
    if (!worker) return analyzePitchTrack(samples, buffer.sampleRate, this.options);

    const id = ++this.nextJobId;
    const job: PitchJob = { id, samples, sampleRate: buffer.sampleRate, options: this.options };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage(job, [samples.buffer]);
    });
  }

  private getWorker(): Worker | null {
    if (this.worker || typeof Worker === 'undefined') return this.worker;
    const worker = new Worker(new URL('./pitch.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<PitchJobResult>) => {
      const job = this.pending.get(data.id);
      this.pending.delete(data.id);
      if ('track' in data) job?.resolve(data.track);
      else job?.reject(new Error(data.error));
    };
    worker.onerror = () => {
      for (const job of this.pending.values()) job.reject(new Error('Pitch analysis stopped unexpectedly.'));
      this.pending.clear();
      worker.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }
}
