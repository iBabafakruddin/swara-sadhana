/**
 * Interfaces the application depends on. Browser implementations live in
 * src/infrastructure; swap them (e.g. for a backend API) in src/app/container.ts.
 */
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import type { TimeRange } from '@/domain/comparison/compareTakes';
import type { Recording, RecordingId } from '@/domain/recording/Recording';
import type { PracticeLogEntry, TakeScore } from '@/domain/progress/progress';
import type { Reference, ReferenceId } from '@/domain/reference/Reference';

export interface RecordingRepository {
  save(recording: Recording): Promise<void>;
  findAll(): Promise<Recording[]>;
  findById(id: RecordingId): Promise<Recording | undefined>;
  delete(id: RecordingId): Promise<void>;
  /** Removes every recording with expiresAt <= now; returns how many were removed. */
  deleteExpired(now: number): Promise<number>;
}

export interface ReferenceRepository {
  save(reference: Reference): Promise<void>;
  findAll(): Promise<Reference[]>;
  findById(id: ReferenceId): Promise<Reference | undefined>;
  delete(id: ReferenceId): Promise<void>;
}

/** Scores kept long-term: no audio, so it is small and outlives the takes. */
export interface ProgressRepository {
  saveTakeScore(score: TakeScore): Promise<void>;
  takeScoresFor(referenceId: ReferenceId): Promise<TakeScore[]>;
  addPracticeLog(entry: PracticeLogEntry): Promise<void>;
  practiceLogFor(referenceId: ReferenceId): Promise<PracticeLogEntry[]>;
  /** Records that some practice happened on this local day ("YYYY-MM-DD"). */
  markActiveDay(day: string): Promise<void>;
  activeDays(): Promise<string[]>;
  /** Removes every score and log entry for a reference. */
  deleteForReference(referenceId: ReferenceId): Promise<void>;
}

export interface CapturedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/** One recording session. Create a fresh instance per take. */
export interface AudioRecorder {
  start(): Promise<void>;
  stop(): Promise<CapturedAudio>;
  cancel(): void;
  /** Current input level, 0..1, for live metering. */
  getInputLevel(): number;
  /** The pitch being sung right now, in Hz, or null when silent or unclear. */
  getLivePitchHz(): number | null;
}

export type AudioRecorderFactory = () => AudioRecorder;

export interface PitchAnalyzer {
  analyze(audio: Blob): Promise<PitchTrack>;
}

export interface AudioInspector {
  /** Length in milliseconds, or 0 when unknown. Rejects when the browser can't play the file. */
  durationMs(audio: Blob): Promise<number>;
}

export interface PlaybackHandle {
  stop(): void;
  /** Resolves when playback ends for any reason. */
  done: Promise<void>;
}

/** Synthesised sounds for practice: a melody as a plain tone, and count-in clicks. */
export interface TonePlayer {
  /** Plays the part of a pitch track inside `range`, slowed down or sped up by `rate`. */
  playMelody(track: PitchTrack, range: TimeRange, rate: number): PlaybackHandle;
  /** `beats` evenly spaced clicks; done resolves on the last one. */
  countIn(beats: number, intervalSec: number): PlaybackHandle;
}

/** The tanpura's first string: Pa for most ragas, Ma or Ni for ragas without Pa. */
export type DroneFirstString = 'pa' | 'ma' | 'ni';

/** A continuous tanpura-style drone on the singer's Sa (shruti). */
export interface DronePlayer {
  start(tonicHz: number, firstString: DroneFirstString): void;
  stop(): void;
  /** 0..1; takes effect smoothly while playing. */
  setVolume(volume: number): void;
}

export interface FileExporter {
  download(file: Blob, fileName: string): void;
}

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): string;
}
