import type { SegmentResult } from '@/domain/comparison/compareTakes';

/**
 * The scores from comparing one take with one reference. Kept after the take itself
 * expires, so a song's progress can be followed for as long as the reference exists.
 */
export interface TakeScore {
  /** One per take and reference: comparing the same take again replaces it. */
  id: string;
  referenceId: string;
  recordingId: string;
  takeTitle: string;
  /** When the take was recorded, epoch milliseconds; orders the history. */
  recordedAt: number;
  overallScore: number;
  /** Score per section of the reference, by section index. */
  sectionScores: number[];
  keyOffsetSemitones: number;
}

/** One scored practice attempt, kept without its audio. */
export interface PracticeLogEntry {
  id: string;
  referenceId: string;
  recordingId: string;
  sectionIndex: number;
  createdAt: number;
  result: SegmentResult;
}

export function takeScoreId(referenceId: string, recordingId: string): string {
  return `${referenceId}|${recordingId}`;
}

/** Local calendar day, e.g. "2026-10-31", so streaks follow the singer's own midnight. */
export function dayKey(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDays(epochMs: number, days: number): number {
  const date = new Date(epochMs);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export interface Streak {
  /** Consecutive days with practice, ending today, or yesterday if today has none yet. */
  days: number;
  practisedToday: boolean;
  /** The last seven days, oldest first, for a small calendar. */
  lastWeek: { day: string; active: boolean }[];
}

export function practiceStreak(activeDays: Iterable<string>, now: number): Streak {
  const active = new Set(activeDays);
  const practisedToday = active.has(dayKey(now));
  // A streak isn't broken until a whole day passes without practice.
  let cursor = practisedToday ? now : shiftDays(now, -1);
  let days = 0;
  while (active.has(dayKey(cursor))) {
    days++;
    cursor = shiftDays(cursor, -1);
  }
  const lastWeek = Array.from({ length: 7 }, (_, k) => {
    const day = dayKey(shiftDays(now, k - 6));
    return { day, active: active.has(day) };
  });
  return { days, practisedToday, lastWeek };
}

export interface SongJourney {
  /** Oldest take first. */
  takes: TakeScore[];
  best: TakeScore | null;
  first: TakeScore | null;
  latest: TakeScore | null;
  /** Latest minus first overall score; 0 with fewer than two takes. */
  change: number;
  /** Sections whose score rose by at least `improvedBy` from the first take to the latest. */
  improvedSections: number[];
  practiceAttempts: number;
  /** Distinct days with a take or a practice attempt for this song. */
  daysPractised: number;
}

export function songJourney(scores: TakeScore[], practiceLog: PracticeLogEntry[], improvedBy = 10): SongJourney {
  const takes = [...scores].sort((a, b) => a.recordedAt - b.recordedAt);
  const first = takes[0] ?? null;
  const latest = takes.at(-1) ?? null;
  const best = takes.reduce<TakeScore | null>((top, t) => (!top || t.overallScore > top.overallScore ? t : top), null);
  const improvedSections =
    first && latest && first !== latest
      ? latest.sectionScores.flatMap((score, i) =>
          first.sectionScores[i] !== undefined && score - first.sectionScores[i] >= improvedBy ? [i] : [],
        )
      : [];
  const days = new Set([...takes.map((t) => dayKey(t.recordedAt)), ...practiceLog.map((p) => dayKey(p.createdAt))]);
  return {
    takes,
    best,
    first,
    latest,
    change: first && latest ? latest.overallScore - first.overallScore : 0,
    improvedSections,
    practiceAttempts: practiceLog.length,
    daysPractised: days.size,
  };
}

/** The most recent take recorded before `recordedAt`, for before-and-after scores. */
export function previousTake(scores: TakeScore[], recordedAt: number): TakeScore | null {
  return scores
    .filter((s) => s.recordedAt < recordedAt)
    .reduce<TakeScore | null>((latest, s) => (!latest || s.recordedAt > latest.recordedAt ? s : latest), null);
}

/** Best overall score among every other take, or null when this is the first. */
export function bestBefore(scores: TakeScore[], excludeId: string): number | null {
  const others = scores.filter((s) => s.id !== excludeId);
  return others.length ? Math.max(...others.map((s) => s.overallScore)) : null;
}
