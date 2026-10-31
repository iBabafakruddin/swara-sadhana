import { useCallback, useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { CapturedAudio } from '@/application/ports';
import type { Recording, RecordingId } from '@/domain/recording/Recording';
import { errorMessage } from '@/shared/errors';
import { reuseAudio } from '@/shared/reuseAudio';

export interface RecordingLibrary {
  items: Recording[];
  loading: boolean;
  error: string | null;
  /** Timestamp of the last refresh, for expiry countdowns. */
  now: number;
  add(audio: CapturedAudio): Promise<void>;
  rename(id: RecordingId, title: string): Promise<void>;
  remove(id: RecordingId): Promise<void>;
  exportToDevice(id: RecordingId): Promise<void>;
}

export function useRecordings(): RecordingLibrary {
  const { recordings, config } = useServices();
  const [items, setItems] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const fresh = await recordings.listActive();
      setItems((previous) => reuseAudio(previous, fresh));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [recordings]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), config.purgeIntervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, config.purgeIntervalMs]);

  const run = useCallback(
    async (action: () => Promise<unknown>, thenRefresh: boolean) => {
      try {
        await action();
        if (thenRefresh) await refresh();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [refresh],
  );

  return {
    items,
    loading,
    error,
    now,
    add: useCallback((audio: CapturedAudio) => run(() => recordings.create(audio), true), [run, recordings]),
    rename: useCallback(
      (id: RecordingId, title: string) => run(() => recordings.rename(id, title), true),
      [run, recordings],
    ),
    remove: useCallback((id: RecordingId) => run(() => recordings.remove(id), true), [run, recordings]),
    exportToDevice: useCallback(
      (id: RecordingId) => run(() => recordings.exportToDevice(id), false),
      [run, recordings],
    ),
  };
}
