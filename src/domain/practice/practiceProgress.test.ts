import { describe, expect, it } from 'vitest';
import type { SegmentIssue } from '@/domain/comparison/compareTakes';
import { readyForFullTake, sectionProgress, type PracticeAttempt } from './practiceProgress';

const rules = { passScore: 75, passesInARow: 2 };

function attempt(sectionIndex: number, score: number, issues: SegmentIssue[] = []): PracticeAttempt {
  return {
    id: `${sectionIndex}-${score}-${Math.random()}`,
    sectionIndex,
    createdAt: 0,
    audio: new Blob(),
    result: {
      index: sectionIndex,
      reference: { startSec: 0, endSec: 1 },
      take: { startSec: 0, endSec: 1 },
      score,
      meanCentsOff: 0,
      biasCents: 0,
      coverage: 1,
      timingSec: 0,
      issues,
      needsWork: score < 75,
    },
  };
}

describe('sectionProgress', () => {
  it('needs passing attempts back to back', () => {
    expect(sectionProgress([attempt(0, 80), attempt(0, 60), attempt(0, 90)], rules)).toMatchObject({
      currentRun: 1,
      passed: false,
    });
    expect(sectionProgress([attempt(0, 60), attempt(0, 80), attempt(0, 90)], rules).passed).toBe(true);
  });

  it('keeps a pass once earned', () => {
    expect(sectionProgress([attempt(0, 80), attempt(0, 80), attempt(0, 40)], rules)).toMatchObject({
      currentRun: 0,
      passed: true,
    });
  });

  it("doesn't count a high score when most of the line was missed", () => {
    expect(sectionProgress([attempt(0, 90, ['missed']), attempt(0, 90)], rules).passed).toBe(false);
  });
});

describe('readyForFullTake', () => {
  it('waits until every weak section has passed', () => {
    const attempts = [attempt(1, 80), attempt(1, 85), attempt(3, 80)];
    expect(readyForFullTake([1, 3], attempts, rules)).toBe(false);
    expect(readyForFullTake([1, 3], [...attempts, attempt(3, 77)], rules)).toBe(true);
    expect(readyForFullTake([], attempts, rules)).toBe(false);
  });
});
