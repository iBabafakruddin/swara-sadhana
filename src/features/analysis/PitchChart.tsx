import type { MouseEvent } from 'react';
import { frequencyToMidi, isNaturalNote, midiToNoteName } from '@/domain/analysis/notes';
import type { PitchTrack } from '@/domain/analysis/pitchDetection';

const WIDTH = 800;
const HEIGHT = 240;
const LABEL_GUTTER = 36;
const PADDING_SEMITONES = 2;
/** Shown before anything has been sung, e.g. at the start of a live chart. */
const DEFAULT_RANGE = { min: 55, max: 69 };

export interface ChartHighlight {
  key: string | number;
  startSec: number;
  endSec: number;
  selected?: boolean;
}

interface Props {
  track: PitchTrack;
  /** Drawn behind the singer's line, e.g. the reference melody to aim for. */
  guideTrack?: PitchTrack;
  /** Time spans to shade, e.g. sections that need work. */
  highlights?: ChartHighlight[];
  /** Left edge of the chart; 0 unless showing part of a recording. */
  startSec?: number;
  /** Right edge of the chart; widened if the tracks run longer. */
  durationSec: number;
  currentTimeSec: number;
  onSeek(timeSec: number): void;
}

/** Pitch over time on a semitone grid, with a playhead that follows playback. */
export function PitchChart({
  track,
  guideTrack,
  highlights = [],
  startSec = 0,
  durationSec,
  currentTimeSec,
  onSeek,
}: Props) {
  const voiced = [...track, ...(guideTrack ?? [])].flatMap((p) =>
    p.frequencyHz === null ? [] : [frequencyToMidi(p.frequencyHz)],
  );
  const minMidi = (voiced.length ? Math.floor(Math.min(...voiced)) : DEFAULT_RANGE.min) - PADDING_SEMITONES;
  const maxMidi = (voiced.length ? Math.ceil(Math.max(...voiced)) : DEFAULT_RANGE.max) + PADDING_SEMITONES;
  const spanSec = Math.max(durationSec, track.at(-1)?.timeSec ?? 0, startSec + 0.001) - startSec;
  const plotWidth = WIDTH - LABEL_GUTTER;

  const x = (timeSec: number) => LABEL_GUTTER + ((timeSec - startSec) / spanSec) * plotWidth;
  const y = (midi: number) => HEIGHT - ((midi - minMidi) / (maxMidi - minMidi)) * HEIGHT;

  // Break the line wherever nothing was sung.
  const linePath = (points: PitchTrack) => {
    let path = '';
    let penDown = false;
    for (const point of points) {
      if (point.frequencyHz === null) {
        penDown = false;
        continue;
      }
      path += `${penDown ? 'L' : 'M'}${x(point.timeSec).toFixed(1)},${y(frequencyToMidi(point.frequencyHz)).toFixed(1)}`;
      penDown = true;
    }
    return path;
  };

  const gridNotes: number[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi++) gridNotes.push(midi);

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    onSeek(Math.max(startSec, startSec + ((svgX - LABEL_GUTTER) / plotWidth) * spanSec));
  };

  return (
    <svg
      className="pitch-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={guideTrack ? 'Your pitch over time, with the reference melody' : 'Pitch over time'}
      onClick={handleClick}
    >
      {highlights.map((h) => (
        <rect
          key={h.key}
          x={x(h.startSec)}
          width={Math.max(2, x(h.endSec) - x(h.startSec))}
          y={0}
          height={HEIGHT}
          className={h.selected ? 'chart-highlight is-selected' : 'chart-highlight'}
        />
      ))}
      {gridNotes.map((midi) => {
        const natural = isNaturalNote(midi);
        return (
          <g key={midi}>
            <line
              x1={LABEL_GUTTER}
              x2={WIDTH}
              y1={y(midi)}
              y2={y(midi)}
              className={natural ? 'grid-line' : 'grid-line grid-line-sharp'}
            />
            {natural && (
              <text x={LABEL_GUTTER - 6} y={y(midi)} className="grid-label">
                {midiToNoteName(midi)}
              </text>
            )}
          </g>
        );
      })}
      {guideTrack && <path d={linePath(guideTrack)} className="guide-line" />}
      <path d={linePath(track)} className="pitch-line" />
      <line x1={x(currentTimeSec)} x2={x(currentTimeSec)} y1={0} y2={HEIGHT} className="playhead" />
    </svg>
  );
}
