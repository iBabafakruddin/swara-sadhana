import { useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { SongJourney, Streak } from '@/domain/progress/progress';
import type { ReferenceId } from '@/domain/reference/Reference';

/** Loads something from the progress history and reloads it whenever the history changes. */
function useProgressValue<T>(load: () => Promise<T>, deps: unknown[]): T | null {
  const { progress } = useServices();
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Progress is decoration: if it can't be read, the rest of the app carries on without it.
    const refresh = () => load().then((v) => !cancelled && setValue(v), () => {});
    void refresh();
    const unsubscribe = progress.onChange(() => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is rebuilt every render; deps say when it changes.
  }, [progress, ...deps]);

  return value;
}

export function useStreak(): Streak | null {
  const { progress, config } = useServices();
  // Re-check periodically too, so the calendar moves on at midnight.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), config.purgeIntervalMs);
    return () => window.clearInterval(timer);
  }, [config.purgeIntervalMs]);
  return useProgressValue(() => progress.streak(), [tick]);
}

export function useJourney(referenceId: ReferenceId): SongJourney | null {
  const { progress } = useServices();
  return useProgressValue(() => progress.journey(referenceId), [referenceId]);
}
