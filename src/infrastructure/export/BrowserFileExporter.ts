import type { FileExporter } from '@/application/ports';

/** Saves a file to the user's device through the browser's normal download flow. */
export class BrowserFileExporter implements FileExporter {
  download(file: Blob, fileName: string): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before freeing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
