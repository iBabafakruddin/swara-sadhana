export type RecordingId = string;

/** A single practice take, kept on the device until it expires. */
export interface Recording {
  id: RecordingId;
  title: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds; the take is purged at or after this time. */
  expiresAt: number;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  audio: Blob;
}
