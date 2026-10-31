export const HOUR_MS = 60 * 60 * 1000;

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Single source of tunable settings. Everything else receives these via the container. */
export const appConfig = {
  /** How long a take lives on the device before it is purged. */
  retentionMs: readPositiveNumber(import.meta.env.VITE_RETENTION_HOURS, 24) * HOUR_MS,
  /** How often the library re-checks for expired takes and refreshes countdowns. */
  purgeIntervalMs: 60_000,
  storage: {
    /** Changing this starts users on an empty database; their saved takes and references stay under the old name. */
    databaseName: 'swara-sadhana',
  },
  pitch: {
    /** Audio is resampled to this rate before analysis; plenty for the singing range. */
    analysisSampleRate: 16_000,
    frameSize: 1024,
    /** 100 ms between pitch points at 16 kHz. */
    hopSize: 1600,
    minFrequencyHz: 70,
    maxFrequencyHz: 1100,
    threshold: 0.15,
    silenceRms: 0.01,
  },
  references: {
    /** Uploads above this are refused; a few minutes of MP3 is well under it. */
    maxUploadBytes: 50 * 1024 * 1024,
  },
  comparison: {
    /** 50 ms between pitch points (at 16 kHz): fine enough for timing feedback, quick enough for whole songs. */
    hopSize: 800,
    /** How far the singer may drift from the reference's timing and still be matched up. */
    maxDriftSec: 4,
    stepPenalty: 0.2,
    /** Allow for singing in a different key (common when following your own shruti). */
    allowKeyChange: true,
    phrases: {
      minGapSec: 0.35,
      minPhraseSec: 1.5,
      maxMergeGapSec: 1.5,
      maxPhraseSec: 8,
    },
    scoring: {
      perfectCents: 10,
      zeroScoreCents: 100,
      fullCoverage: 0.85,
      missedCoverage: 0.6,
      biasCents: 25,
      unsteadyCents: 40,
      timingSec: 0.35,
      passScore: 75,
    },
  },
  practice: {
    /** Passing attempts needed back to back before a section counts as learned. */
    passesInARow: 2,
    /** Clicks before an attempt; the last, higher click means "sing now". */
    countInBeats: 4,
    countInIntervalSec: 0.6,
    /** Keeps recording this long after the section should have ended, for late finishes. */
    graceSec: 1.5,
    speeds: [0.5, 0.75, 1],
  },
};

export type AppConfig = typeof appConfig;
