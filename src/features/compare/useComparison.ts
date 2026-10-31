import { useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { Comparison } from '@/application/ComparisonService';
import type { RecordingId } from '@/domain/recording/Recording';
import type { ReferenceId } from '@/domain/reference/Reference';
import { errorMessage } from '@/shared/errors';

export type ComparisonState =
  | { status: 'loading' }
  | { status: 'ready'; comparison: Comparison }
  | { status: 'error'; message: string };

export function useComparison(referenceId: ReferenceId, recordingId: RecordingId): ComparisonState {
  const { comparisons } = useServices();
  const [state, setState] = useState<ComparisonState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    comparisons.compare(referenceId, recordingId).then(
      (comparison) => !cancelled && setState({ status: 'ready', comparison }),
      (error) => !cancelled && setState({ status: 'error', message: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [comparisons, referenceId, recordingId]);

  return state;
}
