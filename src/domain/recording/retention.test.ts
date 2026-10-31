import { describe, expect, it } from 'vitest';
import { computeExpiresAt, isExpired, timeRemainingMs } from './retention';

describe('retention', () => {
  it('expires exactly one retention period after creation', () => {
    expect(computeExpiresAt(1_000, 500)).toBe(1_500);
  });

  it('treats the expiry instant itself as expired', () => {
    expect(isExpired({ expiresAt: 1_500 }, 1_499)).toBe(false);
    expect(isExpired({ expiresAt: 1_500 }, 1_500)).toBe(true);
  });

  it('never reports negative time remaining', () => {
    expect(timeRemainingMs({ expiresAt: 1_500 }, 1_000)).toBe(500);
    expect(timeRemainingMs({ expiresAt: 1_500 }, 9_999)).toBe(0);
  });
});
