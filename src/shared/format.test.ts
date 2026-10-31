import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatTimeRemaining } from './format';

describe('format', () => {
  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(83_000)).toBe('1:23');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('formats time remaining, rounding up to the minute', () => {
    expect(formatTimeRemaining(24 * 60 * 60_000)).toBe('24h 0m');
    expect(formatTimeRemaining(90_000)).toBe('2m');
    expect(formatTimeRemaining(1)).toBe('1m');
    expect(formatTimeRemaining(0)).toBe('expired');
  });

  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});
