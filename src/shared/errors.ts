export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

export function describeMicrophoneError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return "Microphone access was blocked. Allow it in your browser's site settings and try again.";
      case 'NotFoundError':
        return 'No microphone was found. Connect one and try again.';
      case 'NotReadableError':
        return 'The microphone is being used by another app.';
    }
  }
  return errorMessage(error);
}
