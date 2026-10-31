import type { Recording } from '@/domain/recording/Recording';

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export function extensionForMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return EXTENSIONS[base] ?? 'audio';
}

export function defaultTitle(createdAt: number, label = 'Take'): string {
  const when = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(createdAt);
  return `${label} – ${when}`;
}

/** e.g. "evening-raga-2026-10-31-17-20-05.webm". Keeps non-Latin letters such as Telugu. */
export function buildFileName(recording: Pick<Recording, 'title' | 'createdAt' | 'mimeType'>): string {
  const slug =
    recording.title
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'take';
  const stamp = new Date(recording.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${slug}-${stamp}.${extensionForMimeType(recording.mimeType)}`;
}
