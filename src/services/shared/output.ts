import JSZip from "jszip";
import type { ProcessedFile } from "@/types/files";
import { sanitizeFileName, uniqueNames } from "@/lib/file/names";

export function toProcessedFile(name: string, mime: string, data: Blob | Uint8Array | ArrayBuffer | string): ProcessedFile {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([typeof data === "string" ? data : (data as BlobPart)], { type: mime });
  return { name: sanitizeFileName(name), mime, blob: blob.type === mime ? blob : new Blob([blob], { type: mime }), size: blob.size };
}

/** Bundle several results into a single ZIP (store level for already-compressed formats). */
export async function zipProcessedFiles(files: ProcessedFile[], zipName: string): Promise<ProcessedFile> {
  const zip = new JSZip();
  const names = uniqueNames(files.map((f) => f.name));
  files.forEach((f, i) => {
    const compressible = /^(text\/|application\/(json|xml)|image\/(bmp|svg))/.test(f.mime);
    zip.file(names[i], f.blob, { compression: compressible ? "DEFLATE" : "STORE" });
  });
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
  return toProcessedFile(zipName.endsWith(".zip") ? zipName : `${zipName}.zip`, "application/zip", blob);
}

export async function readBytes(file: { arrayBuffer(): Promise<ArrayBuffer> }): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
