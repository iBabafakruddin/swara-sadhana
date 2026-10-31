export type ReferenceId = string;

export type ReferenceSource = 'upload' | 'recording';

/**
 * A clean vocal to compare takes against: an uploaded file or a line recorded in the app.
 * Unlike takes, references are kept until the user deletes them.
 */
export interface Reference {
  id: ReferenceId;
  title: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** 0 when the browser couldn't tell. */
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  source: ReferenceSource;
  audio: Blob;
}
