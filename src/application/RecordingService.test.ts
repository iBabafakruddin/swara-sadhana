import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRecordingRepository } from '@/infrastructure/storage/InMemoryRecordingRepository';
import { buildFileName } from './naming';
import type { FileExporter } from './ports';
import { RecordingService } from './RecordingService';

const HOUR = 60 * 60 * 1000;

function setup() {
  let now = Date.UTC(2026, 9, 31, 12, 0, 0);
  let nextId = 0;
  const downloads: { file: Blob; fileName: string }[] = [];
  const exporter: FileExporter = { download: (file, fileName) => downloads.push({ file, fileName }) };
  const repository = new InMemoryRecordingRepository();
  const service = new RecordingService(
    { repository, exporter, clock: { now: () => now }, ids: { next: () => `id-${++nextId}` } },
    { retentionMs: 24 * HOUR },
  );
  return {
    service,
    repository,
    downloads,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const audio = (text = 'la la la') => ({
  blob: new Blob([text], { type: 'audio/webm' }),
  mimeType: 'audio/webm;codecs=opus',
  durationMs: 3_000,
});

describe('RecordingService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('stores a take that expires after the retention period', async () => {
    const take = await ctx.service.create(audio());
    expect(take.expiresAt - take.createdAt).toBe(24 * HOUR);
    expect(take.title).toMatch(/^Take/);
    expect(take.sizeBytes).toBe(8);
  });

  it('lists newest first and drops takes once they expire', async () => {
    await ctx.service.create({ ...audio(), title: 'first' });
    ctx.advance(2 * HOUR);
    await ctx.service.create({ ...audio(), title: 'second' });

    expect((await ctx.service.listActive()).map((r) => r.title)).toEqual(['second', 'first']);

    ctx.advance(22 * HOUR);
    expect((await ctx.service.listActive()).map((r) => r.title)).toEqual(['second']);
    expect(await ctx.repository.findAll()).toHaveLength(1);
  });

  it('exports the original audio with a readable file name', async () => {
    const take = await ctx.service.create({ ...audio(), title: 'Evening Raga' });
    await ctx.service.exportToDevice(take.id);

    expect(ctx.downloads).toHaveLength(1);
    expect(ctx.downloads[0].file).toBe(take.audio);
    expect(ctx.downloads[0].fileName).toBe('evening-raga-2026-10-31-12-00-00.webm');
  });

  it('renames, ignoring blank titles', async () => {
    const take = await ctx.service.create({ ...audio(), title: 'old' });
    await ctx.service.rename(take.id, '  new  ');
    await ctx.service.rename(take.id, '   ');
    expect((await ctx.repository.findById(take.id))?.title).toBe('new');
  });

  it('fails clearly when exporting a take that has gone', async () => {
    await expect(ctx.service.exportToDevice('missing')).rejects.toThrow(/no longer exists/);
  });
});

describe('buildFileName', () => {
  it('keeps Telugu titles readable', () => {
    expect(buildFileName({ title: 'నా పాట', createdAt: 0, mimeType: 'audio/mp4' })).toBe(
      'నా-పాట-1970-01-01-00-00-00.m4a',
    );
  });
});
