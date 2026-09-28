import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ProcessContext } from "@/types/processing";

export async function makePdf(pages: number, opts: { text?: (i: number) => string; size?: [number, number] } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(opts.size ?? [595, 842]);
    page.drawText(opts.text?.(i) ?? `Page ${i + 1}`, { x: 50, y: 700, size: 24, font });
  }
  return doc.save();
}

export function fileFrom(bytes: Uint8Array | string, name: string, type = ""): File {
  return new File([bytes as BlobPart], name, { type });
}

export function ctx(): ProcessContext & { messages: string[] } {
  const messages: string[] = [];
  return { signal: new AbortController().signal, onProgress: (p) => p.message && messages.push(p.message), messages };
}

export async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

/** Minimal valid OOXML packages for format detection tests. */
export async function makeOfficeZip(kind: "docx" | "xlsx" | "pptx"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  if (kind === "docx") zip.file("word/document.xml", "<w:document/>");
  if (kind === "xlsx") zip.file("xl/workbook.xml", "<workbook/>");
  if (kind === "pptx") zip.file("ppt/presentation.xml", "<presentation/>");
  return zip.generateAsync({ type: "uint8array" });
}

export const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
