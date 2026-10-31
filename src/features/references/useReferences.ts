import { useCallback, useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { CapturedAudio } from '@/application/ports';
import type { Reference, ReferenceId } from '@/domain/reference/Reference';
import { errorMessage } from '@/shared/errors';
import { reuseAudio } from '@/shared/reuseAudio';

export interface ReferenceLibrary {
  items: Reference[];
  loading: boolean;
  error: string | null;
  importFile(file: File): Promise<void>;
  addRecording(audio: CapturedAudio): Promise<void>;
  rename(id: ReferenceId, title: string): Promise<void>;
  remove(id: ReferenceId): Promise<void>;
}

export function useReferences(): ReferenceLibrary {
  const { references } = useServices();
  const [items, setItems] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await references.list();
      setItems((previous) => reuseAudio(previous, fresh));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [references]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        await refresh();
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
    importFile: useCallback(
      (file: File) => run(() => references.importFile({ blob: file, name: file.name })),
      [run, references],
    ),
    addRecording: useCallback((audio: CapturedAudio) => run(() => references.addRecording(audio)), [run, references]),
    rename: useCallback(
      (id: ReferenceId, title: string) => run(() => references.rename(id, title)),
      [run, references],
    ),
    remove: useCallback((id: ReferenceId) => run(() => references.remove(id)), [run, references]),
  };
}
