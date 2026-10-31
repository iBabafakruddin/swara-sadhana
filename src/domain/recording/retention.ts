import type { Recording } from './Recording';

type Expiring = Pick<Recording, 'expiresAt'>;

export function computeExpiresAt(createdAt: number, retentionMs: number): number {
  return createdAt + retentionMs;
}

export function isExpired(recording: Expiring, now: number): boolean {
  return now >= recording.expiresAt;
}

export function timeRemainingMs(recording: Expiring, now: number): number {
  return Math.max(0, recording.expiresAt - now);
}
