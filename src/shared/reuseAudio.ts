// IndexedDB returns new Blob instances on every read. Reusing the ones we already hold keeps
// object URLs stable, so audio that is playing doesn't restart on each refresh.
export function reuseAudio<T extends { id: string; audio: Blob }>(previous: T[], next: T[]): T[] {
  const known = new Map(previous.map((item) => [item.id, item.audio]));
  return next.map((item) => {
    const audio = known.get(item.id);
    return audio ? { ...item, audio } : item;
  });
}
