export interface RangePlayback {
  stop(): void;
  /** Resolves when the range finishes, playback is paused, or stop() is called. */
  done: Promise<void>;
}

/**
 * Plays one stretch of an <audio> element and pauses at its end. A `rate` plays it slower or
 * faster without changing the pitch, then restores the element's own speed.
 */
export function playRange(audio: HTMLAudioElement, startSec: number, endSec: number, rate?: number): RangePlayback {
  let frame = 0;
  let settled = false;
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const ownRate = audio.playbackRate;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (rate !== undefined) audio.playbackRate = ownRate;
    cancelAnimationFrame(frame);
    audio.removeEventListener('timeupdate', check);
    audio.removeEventListener('pause', finish);
    resolveDone();
  };

  const reachedEnd = () => {
    if (settled || audio.currentTime < endSec) return false;
    audio.pause();
    finish();
    return true;
  };
  // Animation frames give a precise stop while the page is visible; timeupdate (~4 per second)
  // keeps it working when the browser throttles frames, e.g. in a background tab.
  const onFrame = () => {
    if (!settled && !reachedEnd()) frame = requestAnimationFrame(onFrame);
  };
  const check = () => void reachedEnd();

  if (rate !== undefined) {
    audio.preservesPitch = true;
    audio.playbackRate = rate;
  }
  audio.currentTime = Math.max(0, startSec);
  audio.addEventListener('timeupdate', check);
  audio.addEventListener('pause', finish);
  audio.play().then(onFrame, finish);

  return {
    stop: () => {
      audio.pause();
      finish();
    },
    done,
  };
}
