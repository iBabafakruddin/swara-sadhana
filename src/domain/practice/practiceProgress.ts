import type { SegmentResult } from '@/domain/comparison/compareTakes';

export interface PracticeAttempt {
  id: string;
  sectionIndex: number;
  /** Epoch milliseconds. */
  createdAt: number;
  result: SegmentResult;
  /** Only for attempts made this session; saved attempts keep just their scores. */
  audio?: Blob;
}

export interface PracticeRules {
  passScore: number;
  /** Passing attempts needed back to back; more than one shows it wasn't luck. */
  passesInARow: number;
}

export interface SectionProgress {
  attempts: PracticeAttempt[];
  /** Passing attempts at the end of the list, back to back. */
  currentRun: number;
  /** Stays true once earned, even if a later attempt slips. */
  passed: boolean;
}

export function isPassingAttempt(attempt: PracticeAttempt, rules: PracticeRules): boolean {
  return attempt.result.score >= rules.passScore && !attempt.result.issues.includes('missed');
}

export function sectionProgress(attempts: PracticeAttempt[], rules: PracticeRules): SectionProgress {
  let run = 0;
  let passed = false;
  for (const attempt of attempts) {
    run = isPassingAttempt(attempt, rules) ? run + 1 : 0;
    if (run >= rules.passesInARow) passed = true;
  }
  return { attempts, currentRun: run, passed };
}

/** True once every section that needed work has been passed in practice. */
export function readyForFullTake(
  sectionsNeedingWork: number[],
  attempts: PracticeAttempt[],
  rules: PracticeRules,
): boolean {
  if (sectionsNeedingWork.length === 0) return false;
  return sectionsNeedingWork.every(
    (index) => sectionProgress(attempts.filter((a) => a.sectionIndex === index), rules).passed,
  );
}
