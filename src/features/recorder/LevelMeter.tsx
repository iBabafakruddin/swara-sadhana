export function LevelMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <div className={`level-meter ${active ? 'is-active' : ''}`} aria-hidden="true">
      <div className="level-meter-fill" style={{ transform: `scaleX(${level})` }} />
    </div>
  );
}
