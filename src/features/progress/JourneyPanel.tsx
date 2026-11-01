import { useServices } from '@/app/ServicesProvider';
import { scoreBand } from '@/domain/comparison/feedback';
import type { SongJourney, TakeScore } from '@/domain/progress/progress';
import type { ReferenceId } from '@/domain/reference/Reference';
import { useJourney } from './useProgress';

const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 14, right: 16, bottom: 22, left: 30 };
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const DATE_AND_TIME = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const LONG_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A song's progress: score trend over takes, a section-by-take map, and practice totals. */
export function JourneyPanel({ referenceId }: { referenceId: ReferenceId }) {
  const journey = useJourney(referenceId);
  const { config } = useServices();
  const passScore = config.comparison.scoring.passScore;

  if (!journey) return <p className="muted journey-status">Loading progress…</p>;
  if (journey.takes.length === 0) {
    return (
      <p className="muted journey-status">
        No progress yet. Press <strong>Compare</strong> on a take to start this song's journey.
      </p>
    );
  }

  return (
    <div className="journey">
      <JourneyStats journey={journey} />
      <TrendChart takes={journey.takes} best={journey.best} passScore={passScore} />
      <SectionMap journey={journey} passScore={passScore} />
      <p className="hint">Scores stay here after the takes themselves expire.</p>
    </div>
  );
}

function JourneyStats({ journey }: { journey: SongJourney }) {
  const stats: [string, string][] = [
    ['Takes', String(journey.takes.length)],
    ['Best', String(journey.best?.overallScore ?? '–')],
    ['Since first', journey.takes.length > 1 ? signed(journey.change) : '–'],
    ['Practice attempts', String(journey.practiceAttempts)],
    ['Days', String(journey.daysPractised)],
  ];
  return (
    <dl className="pitch-stats journey-stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={label === 'Since first' && journey.change > 0 ? 'change-up' : undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TrendChart({ takes, best, passScore }: { takes: TakeScore[]; best: TakeScore | null; passScore: number }) {
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  // Takes are spaced evenly rather than by date: a busy day shouldn't squash its takes together.
  const x = (i: number) => PAD.left + (takes.length === 1 ? plotWidth / 2 : (i / (takes.length - 1)) * plotWidth);
  const y = (score: number) => PAD.top + (1 - score / 100) * plotHeight;
  const path = takes.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t.overallScore).toFixed(1)}`).join('');

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Overall score over ${takes.length} takes, from ${takes[0].overallScore} to ${takes.at(-1)!.overallScore}`}
    >
      {[0, 50, 100].map((score) => (
        <g key={score}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(score)} y2={y(score)} className="grid-line" />
          <text x={PAD.left - 6} y={y(score)} className="grid-label">
            {score}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(passScore)} y2={y(passScore)} className="pass-line" />
      <text x={WIDTH - PAD.right} y={y(passScore) - 4} className="pass-label">
        pass {passScore}
      </text>
      <path d={path} className="trend-line" />
      {takes.map((t, i) => (
        <circle
          key={t.id}
          cx={x(i)}
          cy={y(t.overallScore)}
          r={t === best ? 6 : 4}
          className={t === best ? 'trend-dot is-best' : 'trend-dot'}
        >
          <title>
            {t.takeTitle} · {LONG_DATE.format(t.recordedAt)}: {t.overallScore}
            {t === best ? ' (best)' : ''}
          </title>
        </circle>
      ))}
      <text x={x(0)} y={HEIGHT - 4} className="axis-label" textAnchor={takes.length === 1 ? 'middle' : 'start'}>
        {SHORT_DATE.format(takes[0].recordedAt)}
      </text>
      {takes.length > 1 && (
        <text x={x(takes.length - 1)} y={HEIGHT - 4} className="axis-label" textAnchor="end">
          {SHORT_DATE.format(takes.at(-1)!.recordedAt)}
        </text>
      )}
    </svg>
  );
}

/** One row per take, one column per section: shows at a glance which lines have come good. */
function SectionMap({ journey, passScore }: { journey: SongJourney; passScore: number }) {
  const sectionCount = Math.max(...journey.takes.map((t) => t.sectionScores.length));
  const improved = new Set(journey.improvedSections);
  // Several takes on one day would all read "31 Oct", so add the time when dates repeat.
  const dates = journey.takes.map((t) => SHORT_DATE.format(t.recordedAt));
  const label = (t: TakeScore, i: number) =>
    dates.indexOf(dates[i]) !== dates.lastIndexOf(dates[i]) ? DATE_AND_TIME.format(t.recordedAt) : dates[i];

  return (
    <div className="section-map-scroll">
      <table className="section-map">
        <caption className="hint">Section scores per take, oldest at the top</caption>
        <thead>
          <tr>
            <th scope="col">Take</th>
            {Array.from({ length: sectionCount }, (_, i) => (
              <th key={i} scope="col" title={improved.has(i) ? 'Improved since the first take' : undefined}>
                S{i + 1}
                {improved.has(i) && <span className="change-up"> ↑</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {journey.takes.map((t, row) => (
            <tr key={t.id}>
              <th scope="row" title={`${t.takeTitle} · ${LONG_DATE.format(t.recordedAt)}`}>
                {label(t, row)}
              </th>
              {Array.from({ length: sectionCount }, (_, i) => {
                const score = t.sectionScores[i];
                return (
                  <td
                    key={i}
                    className={score === undefined ? '' : `heat heat-${scoreBand(score, passScore)}`}
                  >
                    {score ?? '–'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
