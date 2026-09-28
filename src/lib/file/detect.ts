import JSZip from "jszip";
import type { DetectedFormat, FileKind } from "@/types/files";
import { formatOf, getExtension, kindFromExtension } from "./formats";

/** Bytes needed to identify every supported signature. */
export const SNIFF_BYTES = 64;

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

/**
 * Identify a file from its leading bytes. Never uses the file name or the
 * client-declared MIME type. ZIP-based Office formats need `refineZipKind`.
 */
export function sniffKind(head: Uint8Array): FileKind | "zip-container" | undefined {
  // PDF: "%PDF-" may be preceded by a little junk; the spec allows it within the first 1024 bytes.
  if (ascii(head, 0, Math.min(head.length, 1024)).includes("%PDF-")) return "pdf";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "webp";
  if (ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
    // Compatible brands list
    if (ascii(head, 16, 32).includes("avif")) return "avif";
  }
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a") return "gif";
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (ascii(head, 0, 2) === "BM" && head.length >= 14) return "bmp";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    return "zip-container";
  }
  return undefined;
}

/** Decide whether a ZIP is DOCX/XLSX/PPTX by inspecting its entries. */
export async function refineZipKind(bytes: ArrayBuffer | Uint8Array): Promise<FileKind> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    if (zip.file("[Content_Types].xml")) {
      if (zip.file("word/document.xml")) return "docx";
      if (zip.file("xl/workbook.xml")) return "xlsx";
      if (zip.file("ppt/presentation.xml")) return "pptx";
    }
    return "zip";
  } catch {
    return "unknown";
  }
}

/** Heuristic: is this byte sample valid UTF-8 text without control characters? */
export function looksLikeText(sample: Uint8Array): boolean {
  if (sample.length === 0) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    // Sample may end mid-character; retry without the final 3 bytes.
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, Math.max(0, sample.length - 3)));
    } catch {
      return false;
    }
  }
  let control = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    if (c === 0) return false;
    if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) control++;
  }
  return control / decoded.length < 0.01;
}

/**
 * Detect a file's real format from its content. Text files are the only case
 * where the extension is consulted (to tell CSV from plain text) — and only
 * after the bytes were verified to be text.
 */
export async function detectFormat(file: Blob & { name: string }): Promise<DetectedFormat> {
  // Read only the head for signature checks; large files are never fully loaded here.
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  const kind = sniffKind(head.subarray(0, 1024));
  if (kind === "zip-container") return formatOf(await refineZipKind(await file.arrayBuffer()));
  if (kind) return formatOf(kind);
  if (looksLikeText(head)) {
    return formatOf(kindFromExtension(getExtension(file.name)) === "csv" ? "csv" : "text");
  }
  return formatOf("unknown");
}

export async function detectFormatFromBytes(bytes: Uint8Array, name: string): Promise<DetectedFormat> {
  const kind = sniffKind(bytes.subarray(0, 1024));
  if (kind === "zip-container") return formatOf(await refineZipKind(bytes));
  if (kind) return formatOf(kind);
  if (looksLikeText(bytes.subarray(0, 8192))) {
    return formatOf(kindFromExtension(getExtension(name)) === "csv" ? "csv" : "text");
  }
  return formatOf("unknown");
}
