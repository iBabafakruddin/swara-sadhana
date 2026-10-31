import type { AudioInspector } from '@/application/ports';

/** Reads just the file's metadata with an <audio> element, which is much cheaper than decoding it. */
export class HtmlAudioInspector implements AudioInspector {
  durationMs(audio: Blob): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(audio);
      const element = new Audio();
      const finish = (settle: () => void) => {
        element.removeAttribute('src');
        URL.revokeObjectURL(url);
        settle();
      };
      element.preload = 'metadata';
      // Some formats (e.g. MediaRecorder WebM) report an infinite duration; treat that as unknown.
      element.onloadedmetadata = () =>
        finish(() => resolve(Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0));
      element.onerror = () => finish(() => reject(new Error('Unsupported audio file.')));
      element.src = url;
    });
  }
}
