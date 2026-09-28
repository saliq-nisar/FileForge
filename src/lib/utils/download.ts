import { sanitizeFileName } from "@/lib/file/names";
import type { ProcessedFile } from "@/types/files";

/** Trigger a browser download with a safe file name and the correct MIME type. */
export function downloadBlob(blob: Blob, name: string, mime?: string): void {
  const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
  const url = URL.createObjectURL(typed);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFileName(name, "download");
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadProcessed(file: ProcessedFile): void {
  downloadBlob(file.blob, file.name, file.mime);
}

export async function downloadAllAsZip(files: ProcessedFile[], zipName: string): Promise<void> {
  const { zipProcessedFiles } = await import("@/services/shared/output");
  const zip = await zipProcessedFiles(files, zipName);
  downloadProcessed(zip);
}
