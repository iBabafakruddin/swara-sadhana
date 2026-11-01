import { describe, expect, it } from 'vitest';
import {
  bestBefore,
  dayKey,
  practiceStreak,
  previousTake,
  songJourney,
  type PracticeLogEntry,
  type TakeScore,
} from './progress';

const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).getTime();

function take(id: string, day: number, overallScore: number, sectionScores: number[]): TakeScore {
  return {
    id,
    referenceId: 'r',
    recordingId: id,
    takeTitle: id,
    recordedAt: at(day),
    overallScore,
    sectionScores,
    keyOffsetSemitones: 0,
  };
}

const practised = (day: number): PracticeLogEntry =>
  ({ id: `p${day}`, referenceId: 'r', recordingId: 'a', sectionIndex: 0, createdAt: at(day, 20) }) as PracticeLogEntry;

describe('dayKey', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('practiceStreak', () => {
  const days = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-31'];

  it('counts back from today', () => {
    expect(practiceStreak([...days, '2026-10-30'], at(31))).toMatchObject({ days: 5, practisedToday: true });
  });

  it("keeps yesterday's streak alive until today is over", () => {
    expect(practiceStreak(days.slice(0, 3), at(30))).toMatchObject({ days: 3, practisedToday: false });
    expect(practiceStreak(days.slice(0, 3), at(31)).days).toBe(0);
  });

  it('lists the last seven days for the calendar', () => {
    const week = practiceStreak(days, at(31)).lastWeek;
    expect(week).toHaveLength(7);
    expect(week[0].day).toBe('2026-10-25');
    expect(week.at(-1)).toEqual({ day: '2026-10-31', active: true });
    expect(week.filter((d) => d.active)).toHaveLength(4);
  });
});

describe('songJourney', () => {
  const scores = [take('t3', 28, 88, [88, 85, 89]), take('t1', 20, 60, [80, 40, 62]), take('t2', 24, 91, [95, 88, 90])];

  it('orders takes and finds the first, latest and best', () => {
    const journey = songJourney(scores, [practised(21), practised(24)]);
    expect(journey.takes.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(journey.best?.id).toBe('t2');
    expect(journey.change).toBe(28);
    expect(journey.improvedSections).toEqual([1, 2]);
    expect(journey.practiceAttempts).toBe(2);
    // The 24th has both a take and practice, so it counts once.
    expect(journey.daysPractised).toBe(4);
  });

  it('copes with no history', () => {
    expect(songJourney([], [])).toMatchObject({ best: null, change: 0, improvedSections: [], daysPractised: 0 });
  });
});

describe('previousTake and bestBefore', () => {
  const scores = [take('t1', 20, 60, []), take('t2', 24, 91, []), take('t3', 28, 88, [])];

  it('finds the take just before', () => {
    expect(previousTake(scores, at(28))?.id).toBe('t2');
    expect(previousTake(scores, at(20))).toBeNull();
  });

  it('finds the best score among other takes', () => {
    expect(bestBefore(scores, 't2')).toBe(88);
    expect(bestBefore([scores[0]], 't1')).toBeNull();
  });
});
