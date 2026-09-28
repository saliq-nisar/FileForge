import JSZip from "jszip";
import { AppError, throwIfAborted } from "@/lib/errors";
import { detectFormat } from "@/lib/file/detect";
import { FORMATS } from "@/lib/file/formats";
import { deriveFileName, sanitizeFileName, uniqueNames } from "@/lib/file/names";
import { str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile, ProcessedFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { toProcessedFile } from "@/services/shared/output";
import { bitmapToCanvas, encodeCanvas } from "@/services/image/canvas";
import { asBlob } from "@/services/image/process";

const JPEG_SETTINGS = { recommended: { maxDim: 2000, quality: 0.75 }, strong: { maxDim: 1400, quality: 0.55 } } as const;

/** Guard against ZIP bombs: cap entries and total uncompressed size. */
function checkArchiveLimits(zip: JSZip): void {
  const entries = Object.values(zip.files);
  if (entries.length > 20_000) throw new AppError("PROCESSING_FAILED", "This archive contains too many files to process safely.");
  let total = 0;
  for (const e of entries) {
    const size = (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    total += size;
  }
  if (total > 2_000_000_000) throw new AppError("FILE_TOO_LARGE", "This archive expands to more than 2 GB and can't be processed in the browser.");
}

async function repack(zip: JSZip, mime: string, transform?: (path: string, data: Uint8Array) => Promise<Uint8Array>, ctx?: ProcessContext): Promise<Blob> {
  const out = new JSZip();
  const entries = Object.values(zip.files);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    throwIfAborted(ctx?.signal);
    if (entry.dir) {
      out.folder(entry.name);
      continue;
    }
    let data = await entry.async("uint8array");
    if (transform) data = await transform(entry.name, data);
    // Already-compressed media gain nothing from DEFLATE; store them to save time.
    const stored = /\.(jpe?g|png|gif|webp|avif|mp4|mp3|m4a|zip|gz|7z|rar|pdf)$/i.test(entry.name);
    out.file(entry.name, data, {
      compression: stored ? "STORE" : "DEFLATE",
      compressionOptions: { level: 9 },
      date: entry.date,
      comment: entry.comment,
      unixPermissions: entry.unixPermissions,
      dosPermissions: entry.dosPermissions,
    });
    ctx?.onProgress({ ratio: 0.1 + (i / entries.length) * 0.8, message: `Repacking ${i + 1} of ${entries.length}` });
  }
  return out.generateAsync({ type: "blob", mimeType: mime, compression: "DEFLATE", compressionOptions: { level: 9 } });
}

async function recompressJpeg(data: Uint8Array, level: keyof typeof JPEG_SETTINGS): Promise<Uint8Array> {
  const { maxDim, quality } = JPEG_SETTINGS[level];
  try {
    const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: "image/jpeg" }));
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = bitmapToCanvas(bitmap, bitmap.width * scale, bitmap.height * scale, "#ffffff");
    bitmap.close();
    const out = new Uint8Array(await (await encodeCanvas(canvas, "jpeg", quality)).arrayBuffer());
    return out.length < data.length * 0.95 ? out : data;
  } catch {
    return data;
  }
}

function honest(original: Blob, result: Blob, name: string, mime: string): { file: ProcessedFile; note?: string } {
  if (result.size >= original.size) {
    return {
      file: toProcessedFile(name, mime, original),
      note: "Some files were already optimally compressed — the original was kept because it was smaller.",
    };
  }
  return { file: toProcessedFile(name, mime, result) };
}

export async function compressOffice(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const level = str(options, "level", "recommended");
  const files: ProcessedFile[] = [];
  const notes = new Set<string>();
  for (const input of inputs) {
    throwIfAborted(ctx.signal);
    const blob = await asBlob(input);
    const format = await detectFormat(Object.assign(blob, { name: input.name }));
    if (!["docx", "xlsx", "pptx"].includes(format.kind)) throw new AppError("UNSUPPORTED_FORMAT");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    checkArchiveLimits(zip);
    const result = await repack(
      zip,
      format.mime,
      level === "low"
        ? undefined
        : async (path, data) => (/^(word|xl|ppt)\/media\/.+\.jpe?g$/i.test(path) ? recompressJpeg(data, level as keyof typeof JPEG_SETTINGS) : data),
      ctx,
    );
    const r = honest(blob, result, deriveFileName(input.name, "compressed", format.ext), format.mime);
    files.push(r.file);
    if (r.note) notes.add(r.note);
  }
  return { files, notes: [...notes] };
}

export async function recompressZip(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const blob = await asBlob(inputs[0]);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await blob.arrayBuffer());
  } catch {
    throw new AppError("UNSUPPORTED_FORMAT", "This ZIP archive is corrupted or encrypted.");
  }
  checkArchiveLimits(zip);
  const result = await repack(zip, "application/zip", undefined, ctx);
  const r = honest(blob, result, deriveFileName(inputs[0].name, "compressed", "zip"), "application/zip");
  return { files: [r.file], notes: r.note ? [r.note] : [] };
}

export async function createZip(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const zip = new JSZip();
  const names = uniqueNames(inputs.map((f) => sanitizeFileName(f.name)));
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Adding ${names[i]}` });
    const stored = /\.(jpe?g|png|gif|webp|avif|mp4|mp3|zip|pdf|docx|xlsx|pptx)$/i.test(names[i]);
    zip.file(names[i], await asBlob(inputs[i]), { compression: stored ? "STORE" : "DEFLATE", compressionOptions: { level: 9 } });
  }
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" }, (m) =>
    ctx.onProgress({ ratio: 0.5 + m.percent / 200, message: "Compressing" }),
  );
  const name = inputs.length === 1 ? deriveFileName(inputs[0].name, null, "zip") : "archive.zip";
  return { files: [toProcessedFile(name, "application/zip", blob)] };
}

/** Pick the right compressor per file; explain unsupported formats instead of faking it. */
export async function autoCompress(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const level = str(options, "level", "recommended");
  const files: ProcessedFile[] = [];
  const notes: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    const input = inputs[i];
    const blob = await asBlob(input);
    const format = await detectFormat(Object.assign(blob, { name: input.name }));
    const sub: ProcessContext = {
      signal: ctx.signal,
      onProgress: (p) => ctx.onProgress({ ...p, ratio: (i + (p.ratio ?? 0)) / inputs.length, step: i + 1, totalSteps: inputs.length }),
    };
    let result: ProcessResult;
    if (format.kind === "pdf") {
      const { compressPdf } = await import("@/services/pdf/compress");
      result = await compressPdf([input], { level, rasterize: false }, sub);
    } else if (["jpeg", "png", "webp", "avif"].includes(format.kind)) {
      const { compressImages } = await import("@/services/image/process");
      const quality = level === "low" ? 88 : level === "strong" ? 55 : 72;
      result = await compressImages([input], { quality, format: "original", maxSizeKb: 0, maxWidth: 0, maxHeight: 0 }, sub);
    } else if (["docx", "xlsx", "pptx"].includes(format.kind)) {
      result = await compressOffice([input], { level }, sub);
    } else if (format.kind === "zip") {
      result = await recompressZip([input], {}, sub);
    } else {
      notes.push(`${sanitizeFileName(input.name)}: ${FORMATS[format.kind].label} files aren't supported for compression. You can bundle them with "Create ZIP archive" instead.`);
      continue;
    }
    files.push(...result.files);
    notes.push(...(result.notes ?? []));
  }
  if (files.length === 0) throw new AppError("UNSUPPORTED_FORMAT", notes[0]);
  return { files, notes: [...new Set(notes)] };
}
