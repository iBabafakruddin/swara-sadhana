import type { Recording, RecordingId } from '@/domain/recording/Recording';
import { computeExpiresAt, isExpired } from '@/domain/recording/retention';
import { buildFileName, defaultTitle } from './naming';
import type { CapturedAudio, Clock, FileExporter, IdGenerator, RecordingRepository } from './ports';

export interface RecordingServiceDeps {
  repository: RecordingRepository;
  exporter: FileExporter;
  clock: Clock;
  ids: IdGenerator;
}

export interface RecordingServiceOptions {
  retentionMs: number;
}

export interface NewRecordingInput extends CapturedAudio {
  title?: string;
}

/** Use cases for practice takes: keep them briefly, export the ones worth keeping. */
export class RecordingService {
  constructor(
    private readonly deps: RecordingServiceDeps,
    private readonly options: RecordingServiceOptions,
  ) {}

  async create(input: NewRecordingInput): Promise<Recording> {
    const createdAt = this.deps.clock.now();
    const recording: Recording = {
      id: this.deps.ids.next(),
      title: input.title?.trim() || defaultTitle(createdAt),
      createdAt,
      expiresAt: computeExpiresAt(createdAt, this.options.retentionMs),
      durationMs: input.durationMs,
      mimeType: input.mimeType,
      sizeBytes: input.blob.size,
      audio: input.blob,
    };
    await this.deps.repository.save(recording);
    return recording;
  }

  /** Purges expired takes, then returns the rest, newest first. */
  async listActive(): Promise<Recording[]> {
    const now = this.deps.clock.now();
    await this.deps.repository.deleteExpired(now);
    const all = await this.deps.repository.findAll();
    return all.filter((r) => !isExpired(r, now)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async rename(id: RecordingId, title: string): Promise<void> {
    const recording = await this.require(id);
    const trimmed = title.trim();
    if (!trimmed || trimmed === recording.title) return;
    await this.deps.repository.save({ ...recording, title: trimmed });
  }

  async remove(id: RecordingId): Promise<void> {
    await this.deps.repository.delete(id);
  }

  /** "Save" means a permanent copy on the user's device; the in-app copy still expires. */
  async exportToDevice(id: RecordingId): Promise<void> {
    const recording = await this.require(id);
    this.deps.exporter.download(recording.audio, buildFileName(recording));
  }

  purgeExpired(): Promise<number> {
    return this.deps.repository.deleteExpired(this.deps.clock.now());
  }

  private async require(id: RecordingId): Promise<Recording> {
    const recording = await this.deps.repository.findById(id);
    if (!recording) throw new Error('This take no longer exists. It may have expired.');
    return recording;
  }
}
