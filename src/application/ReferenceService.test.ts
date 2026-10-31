import { describe, expect, it } from 'vitest';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';
import { appConfig } from '@/config/appConfig';
import { InMemoryRecordingRepository } from '@/infrastructure/storage/InMemoryRecordingRepository';
import { InMemoryReferenceRepository } from '@/infrastructure/storage/InMemoryReferenceRepository';
import { ComparisonService } from './ComparisonService';
import type { AudioInspector, PitchAnalyzer } from './ports';
import { ReferenceService } from './ReferenceService';

const MB = 1024 * 1024;

function setup(inspector: AudioInspector = { durationMs: async () => 61_000 }) {
  let nextId = 0;
  const repository = new InMemoryReferenceRepository();
  const service = new ReferenceService(
    { repository, inspector, clock: { now: () => Date.UTC(2026, 9, 31) }, ids: { next: () => `ref-${++nextId}` } },
    { maxUploadBytes: 5 * MB },
  );
  return { service, repository };
}

const file = (name: string, type: string, size = 100) => ({ name, blob: new Blob([new Uint8Array(size)], { type }) });

describe('ReferenceService', () => {
  it('imports an audio file, named after the file', async () => {
    const { service } = setup();
    const reference = await service.importFile(file('Swara Raga Sudha.mp3', 'audio/mpeg'));
    expect(reference).toMatchObject({ title: 'Swara Raga Sudha', durationMs: 61_000, source: 'upload', sizeBytes: 100 });
  });

  it('refuses files that are not audio, too big, or unplayable', async () => {
    await expect(setup().service.importFile(file('notes.pdf', 'application/pdf'))).rejects.toThrow(/isn't an audio file/);
    await expect(setup().service.importFile(file('long.wav', 'audio/wav', 6 * MB))).rejects.toThrow(/larger than 5 MB/);
    const broken = setup({ durationMs: () => Promise.reject(new Error('bad')) });
    await expect(broken.service.importFile(file('odd.xyz', ''))).rejects.toThrow(/can't play "odd.xyz"/);
  });

  it('keeps recorded references with a default title, newest first', async () => {
    const { service } = setup();
    await service.importFile(file('first.m4a', 'audio/mp4'));
    const recorded = await service.addRecording({ blob: new Blob(['x']), mimeType: 'audio/webm', durationMs: 4_000 });
    expect(recorded.title).toMatch(/^Reference/);
    expect(recorded.source).toBe('recording');
    expect((await service.list()).map((r) => r.id)).toEqual(expect.arrayContaining(['ref-1', 'ref-2']));
  });

  it('renames and removes', async () => {
    const { service, repository } = setup();
    const reference = await service.importFile(file('a.mp3', 'audio/mpeg'));
    await service.rename(reference.id, '  Pallavi  ');
    expect((await repository.findById(reference.id))?.title).toBe('Pallavi');
    await service.remove(reference.id);
    expect(await repository.findAll()).toHaveLength(0);
  });
});

describe('ComparisonService', () => {
  const sung: PitchTrack = Array.from({ length: 60 }, (_, i) => ({ timeSec: i * 0.05, frequencyHz: i < 40 ? 220 : 247 }));

  async function setupComparison() {
    const references = new InMemoryReferenceRepository();
    const recordings = new InMemoryRecordingRepository();
    const analysed: Blob[] = [];
    const analyzer: PitchAnalyzer = {
      analyze: async (audio) => {
        analysed.push(audio);
        return sung;
      },
    };
    const service = new ComparisonService({ references, recordings, analyzer }, appConfig.comparison);
    const audio = new Blob(['a']);
    await references.save({ id: 'r', title: 'r', createdAt: 0, durationMs: 0, mimeType: '', sizeBytes: 1, source: 'upload', audio });
    await recordings.save({ id: 't', title: 't', createdAt: 0, expiresAt: 1, durationMs: 0, mimeType: '', sizeBytes: 1, audio });
    return { service, analysed };
  }

  it('compares a take with a reference, analysing each only once', async () => {
    const { service, analysed } = await setupComparison();
    const first = await service.compare('r', 't');
    expect(first.report.overallScore).toBe(100);
    expect(first.takeTrack).toBe(sung);
    await service.compare('r', 't');
    expect(analysed).toHaveLength(2);
  });

  it('explains a missing reference or take', async () => {
    const { service } = await setupComparison();
    await expect(service.compare('gone', 't')).rejects.toThrow(/reference no longer exists/);
    await expect(service.compare('r', 'gone')).rejects.toThrow(/take no longer exists/);
  });
});
