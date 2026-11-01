import { HOUR_MS } from '@/config/appConfig';
import { DronePanel } from '@/features/drone/DronePanel';
import { RecordingList } from '@/features/library/RecordingList';
import { useRecordings } from '@/features/library/useRecordings';
import { StreakBadge } from '@/features/progress/StreakBadge';
import { RecorderPanel } from '@/features/recorder/RecorderPanel';
import { ReferencePanel } from '@/features/references/ReferencePanel';
import { useReferences } from '@/features/references/useReferences';
import { useServices } from './ServicesProvider';

export function App() {
  const { config } = useServices();
  const library = useRecordings();
  const references = useReferences();
  const retentionHours = Math.round(config.retentionMs / HOUR_MS);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Swara Sadhana{' '}
          <span lang="te" className="app-name-te">
            స్వర సాధన
          </span>
        </h1>
        <p>
          Record a take, listen back, check your pitch. Takes stay on this device for {retentionHours} hours, so
          save the ones you want to keep.
        </p>
        <StreakBadge />
      </header>
      <main className="app-main">
        <RecorderPanel onCaptured={library.add} />
        <DronePanel />
        <ReferencePanel library={references} />
        <RecordingList library={library} references={references.items} />
      </main>
    </div>
  );
}
