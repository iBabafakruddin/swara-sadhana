import { useStreak } from './useProgress';

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const FULL_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

/** Daily sadhana streak with a seven-day dot calendar. */
export function StreakBadge() {
  const streak = useStreak();
  if (!streak) return null;

  const message =
    streak.days === 0
      ? 'Sing something today to start a streak.'
      : streak.practisedToday
        ? `${streak.days}-day sadhana streak`
        : `${streak.days}-day streak · sing today to keep it`;

  return (
    <div className="streak" aria-label={`Practice streak: ${message}`}>
      <ol className="streak-week">
        {streak.lastWeek.map(({ day, active }, k) => {
          const date = parseDay(day);
          const isToday = k === streak.lastWeek.length - 1;
          return (
            <li
              key={day}
              className={`streak-day ${active ? 'is-active' : ''} ${isToday ? 'is-today' : ''}`}
              title={`${FULL_DATE.format(date)}: ${active ? 'practised' : 'no practice'}`}
            >
              <span className="streak-dot" />
              <span className="streak-label" aria-hidden="true">
                {WEEKDAY.format(date)}
              </span>
            </li>
          );
        })}
      </ol>
      <span className={`streak-text ${streak.practisedToday ? 'is-done' : ''}`}>{message}</span>
    </div>
  );
}

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}
