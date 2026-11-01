import { useEffect, useState } from 'react';
import { useServices } from '@/app/ServicesProvider';
import type { DroneFirstString } from '@/application/ports';
import { findShruti, SHRUTIS } from '@/domain/analysis/shruti';

const STORAGE_KEY = 'swara-sadhana:drone';
const FIRST_STRINGS: { value: DroneFirstString; label: string }[] = [
  { value: 'pa', label: 'Pa' },
  { value: 'ma', label: 'Ma' },
  { value: 'ni', label: 'Ni' },
];

interface DroneSettings {
  shruti: string;
  firstString: DroneFirstString;
  volume: number;
}

/** A tanpura drone on the singer's Sa, for warming up and singing along with headphones. */
export function DronePanel() {
  const { drone, config } = useServices();
  const [settings, setSettings] = useState<DroneSettings>(() =>
    loadSettings({ shruti: config.drone.defaultShruti, firstString: 'pa', volume: config.drone.defaultVolume }),
  );
  const [playing, setPlaying] = useState(false);
  const shruti = findShruti(settings.shruti) ?? SHRUTIS[0];

  const update = (patch: Partial<DroneSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  };

  // Retune straight away when the shruti or first string changes while playing.
  useEffect(() => {
    if (playing) drone.start(shruti.frequencyHz, settings.firstString);
  }, [drone, playing, shruti.frequencyHz, settings.firstString]);

  useEffect(() => drone.setVolume(settings.volume), [drone, settings.volume]);

  // Silence the drone if the panel goes away.
  useEffect(() => () => drone.stop(), [drone]);

  const toggle = () => {
    if (playing) drone.stop();
    setPlaying(!playing);
  };

  return (
    <section className="panel drone" aria-labelledby="drone-heading">
      <div className="drone-header">
        <h2 id="drone-heading">Tanpura</h2>
        <div className={`tanpura-strings ${playing ? 'is-playing' : ''}`} aria-hidden="true">
          {[0, 1, 2, 3].map((k) => (
            <span key={k} style={{ animationDelay: `${k * 0.6}s` }} />
          ))}
        </div>
      </div>
      <p className="hint">
        Find your Sa before you sing. Use headphones while recording: if the microphone hears the drone, pitch
        detection gets confused.
      </p>
      <div className="drone-controls">
        <label className="speed">
          Shruti
          <select value={shruti.note} onChange={(e) => update({ shruti: e.target.value })}>
            {SHRUTIS.map((s) => (
              <option key={s.note} value={s.note}>
                {s.note} · {s.kattai} kattai
              </option>
            ))}
          </select>
        </label>
        <label className="speed">
          First string
          <select
            value={settings.firstString}
            onChange={(e) => update({ firstString: e.target.value as DroneFirstString })}
          >
            {FIRST_STRINGS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="speed">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
          />
        </label>
        <span className="spacer" />
        <button type="button" className="button button-primary" aria-pressed={playing} onClick={toggle}>
          {playing ? 'Stop tanpura' : 'Play tanpura'}
        </button>
      </div>
    </section>
  );
}

// The chosen shruti is a per-device convenience, so localStorage is enough; it may be unavailable.
function loadSettings(defaults: DroneSettings): DroneSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<DroneSettings> | null;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: DroneSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: the setting just won't be remembered.
  }
}
