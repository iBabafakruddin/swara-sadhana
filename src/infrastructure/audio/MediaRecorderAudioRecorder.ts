import type { AudioRecorder, CapturedAudio } from '@/application/ports';
import { detectPitch, type PitchDetectionOptions } from '@/domain/analysis/pitchDetection';

/** Live pitch is detected at about this rate: plenty for singing and cheap enough to run every frame. */
const LIVE_PITCH_SAMPLE_RATE = 16_000;

// In order of preference; Safari only supports audio/mp4.
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export class MediaRecorderAudioRecorder implements AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuffer: Float32Array | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  constructor(private readonly pitchOptions: PitchDetectionOptions) {}

  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(): Promise<void> {
    if (this.recorder) throw new Error('A recording is already in progress.');
    // Voice-call processing (echo cancellation, noise suppression, AGC) distorts singing.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    try {
      const mimeType = pickSupportedMimeType();
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.connectLevelMeter(this.stream);
      this.recorder.start(1000);
      this.startedAt = performance.now();
    } catch (error) {
      this.release();
      throw error;
    }
  }

  stop(): Promise<CapturedAudio> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('No recording in progress.'));
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || this.chunks[0]?.type || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationMs = performance.now() - this.startedAt;
        this.release();
        resolve({ blob, mimeType, durationMs });
      };
      recorder.onerror = () => {
        this.release();
        reject(new Error('Recording failed.'));
      };
      recorder.stop();
    });
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  getInputLevel(): number {
    if (!this.analyser || !this.levelBuffer) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (const sample of this.levelBuffer) sum += sample * sample;
    // Scale RMS so normal singing sits around the middle of the meter.
    return Math.min(1, Math.sqrt(sum / this.levelBuffer.length) * 4);
  }

  getLivePitchHz(): number | null {
    if (!this.analyser || !this.levelBuffer || !this.audioContext) return null;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    // Average groups of samples down to ~16 kHz, which cuts the YIN cost by the same factor.
    const factor = Math.max(1, Math.floor(this.audioContext.sampleRate / LIVE_PITCH_SAMPLE_RATE));
    const reduced = new Float32Array(Math.floor(this.levelBuffer.length / factor));
    for (let i = 0; i < reduced.length; i++) {
      let sum = 0;
      for (let k = 0; k < factor; k++) sum += this.levelBuffer[i * factor + k];
      reduced[i] = sum / factor;
    }
    return detectPitch(reduced, this.audioContext.sampleRate / factor, this.pitchOptions);
  }

  private connectLevelMeter(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.audioContext.createMediaStreamSource(stream).connect(this.analyser);
    this.levelBuffer = new Float32Array(this.analyser.fftSize);
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.stream = null;
    this.recorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.levelBuffer = null;
  }
}

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}
