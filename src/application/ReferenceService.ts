import type { Reference, ReferenceId, ReferenceSource } from '@/domain/reference/Reference';
import { defaultTitle } from './naming';
import type { AudioInspector, CapturedAudio, Clock, IdGenerator, ReferenceRepository } from './ports';
import type { ProgressService } from './ProgressService';

export interface ReferenceServiceDeps {
  repository: ReferenceRepository;
  inspector: AudioInspector;
  clock: Clock;
  ids: IdGenerator;
  /** Deleting a reference also deletes its score history. */
  history?: Pick<ProgressService, 'forgetReference'>;
}

export interface ReferenceServiceOptions {
  maxUploadBytes: number;
}

export interface UploadedFile {
  blob: Blob;
  name: string;
}

/** Use cases for reference vocals: add them by upload or recording, keep them until deleted. */
export class ReferenceService {
  constructor(
    private readonly deps: ReferenceServiceDeps,
    private readonly options: ReferenceServiceOptions,
  ) {}

  async importFile(file: UploadedFile): Promise<Reference> {
    const type = file.blob.type;
    // Some systems leave the type blank; the inspector below still catches files that aren't audio.
    if (type && !/^(audio|video)\//.test(type)) {
      throw new Error(`"${file.name}" isn't an audio file. Choose an MP3, M4A, WAV, OGG or WebM file.`);
    }
    if (file.blob.size > this.options.maxUploadBytes) {
      const limitMb = Math.round(this.options.maxUploadBytes / (1024 * 1024));
      throw new Error(`"${file.name}" is larger than ${limitMb} MB. Trim it to the part you want to practise.`);
    }
    let durationMs: number;
    try {
      durationMs = await this.deps.inspector.durationMs(file.blob);
    } catch {
      throw new Error(`This browser can't play "${file.name}". Try converting it to MP3 or WAV.`);
    }
    return this.store({
      audio: file.blob,
      mimeType: type || 'audio/mpeg',
      durationMs,
      source: 'upload',
      title: file.name.replace(/\.[^.]+$/, '').trim(),
    });
  }

  addRecording(captured: CapturedAudio): Promise<Reference> {
    return this.store({ audio: captured.blob, mimeType: captured.mimeType, durationMs: captured.durationMs, source: 'recording' });
  }

  /** Newest first. */
  async list(): Promise<Reference[]> {
    const all = await this.deps.repository.findAll();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async rename(id: ReferenceId, title: string): Promise<void> {
    const reference = await this.deps.repository.findById(id);
    if (!reference) throw new Error('This reference no longer exists.');
    const trimmed = title.trim();
    if (!trimmed || trimmed === reference.title) return;
    await this.deps.repository.save({ ...reference, title: trimmed });
  }

  async remove(id: ReferenceId): Promise<void> {
    await this.deps.repository.delete(id);
    await this.deps.history?.forgetReference(id);
  }

  private async store(input: {
    audio: Blob;
    mimeType: string;
    durationMs: number;
    source: ReferenceSource;
    title?: string;
  }): Promise<Reference> {
    const createdAt = this.deps.clock.now();
    const reference: Reference = {
      id: this.deps.ids.next(),
      title: input.title || defaultTitle(createdAt, 'Reference'),
      createdAt,
      durationMs: input.durationMs,
      mimeType: input.mimeType,
      sizeBytes: input.audio.size,
      source: input.source,
      audio: input.audio,
    };
    await this.deps.repository.save(reference);
    return reference;
  }
}
