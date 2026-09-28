import type { DetectedFormat, FileFamily, FileKind } from "@/types/files";

interface FormatInfo {
  family: FileFamily;
  mime: string;
  ext: string;
  /** Other extensions accepted for this kind. */
  aliases: string[];
  label: string;
}

export const FORMATS: Record<FileKind, FormatInfo> = {
  pdf: { family: "pdf", mime: "application/pdf", ext: "pdf", aliases: [], label: "PDF" },
  jpeg: { family: "image", mime: "image/jpeg", ext: "jpg", aliases: ["jpeg", "jpe", "jfif"], label: "JPG" },
  png: { family: "image", mime: "image/png", ext: "png", aliases: [], label: "PNG" },
  webp: { family: "image", mime: "image/webp", ext: "webp", aliases: [], label: "WebP" },
  avif: { family: "image", mime: "image/avif", ext: "avif", aliases: [], label: "AVIF" },
  gif: { family: "image", mime: "image/gif", ext: "gif", aliases: [], label: "GIF" },
  tiff: { family: "image", mime: "image/tiff", ext: "tiff", aliases: ["tif"], label: "TIFF" },
  bmp: { family: "image", mime: "image/bmp", ext: "bmp", aliases: ["dib"], label: "BMP" },
  docx: {
    family: "document",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
    aliases: [],
    label: "Word (DOCX)",
  },
  xlsx: {
    family: "document",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
    aliases: [],
    label: "Excel (XLSX)",
  },
  pptx: {
    family: "document",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: "pptx",
    aliases: [],
    label: "PowerPoint (PPTX)",
  },
  zip: { family: "archive", mime: "application/zip", ext: "zip", aliases: [], label: "ZIP archive" },
  text: { family: "text", mime: "text/plain", ext: "txt", aliases: ["text", "md", "log"], label: "Text" },
  csv: { family: "text", mime: "text/csv", ext: "csv", aliases: [], label: "CSV" },
  unknown: { family: "other", mime: "application/octet-stream", ext: "bin", aliases: [], label: "Unknown" },
};

export const IMAGE_KINDS: FileKind[] = ["jpeg", "png", "webp", "avif", "gif", "tiff", "bmp"];
export const OFFICE_KINDS: FileKind[] = ["docx", "xlsx", "pptx"];

export function formatOf(kind: FileKind): DetectedFormat {
  const f = FORMATS[kind];
  return { kind, family: f.family, mime: f.mime, ext: f.ext, label: f.label };
}

export function extensionsFor(kind: FileKind): string[] {
  const f = FORMATS[kind];
  return [f.ext, ...f.aliases];
}

/** Lowercased extension without the dot, or "" when none. */
export function getExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function kindFromExtension(ext: string): FileKind | undefined {
  const e = ext.toLowerCase();
  return (Object.keys(FORMATS) as FileKind[]).find(
    (k) => k !== "unknown" && extensionsFor(k).includes(e),
  );
}

/** Value for an <input accept> attribute built from allowed kinds. */
export function acceptAttribute(kinds: FileKind[]): string {
  const parts = new Set<string>();
  for (const k of kinds) {
    parts.add(FORMATS[k].mime);
    for (const e of extensionsFor(k)) parts.add(`.${e}`);
  }
  return [...parts].join(",");
}

/** "PDF", "JPG, PNG or WebP" */
export function describeKinds(kinds: FileKind[]): string {
  const labels = [...new Set(kinds.map((k) => FORMATS[k].label))];
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}
