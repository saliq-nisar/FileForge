import { PDFDocument, type PDFImage } from "pdf-lib";
import { throwIfAborted } from "@/lib/errors";
import { readExif } from "@/lib/file/exif";
import { deriveFileName } from "@/lib/file/names";
import { str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { toProcessedFile } from "@/services/shared/output";
import { bitmapToCanvas, decodeImage, encodeCanvas } from "@/services/image/canvas";
import { asBlob, detectImageMime } from "@/services/image/process";
import { MM_TO_PT, PAGE_SIZES, savePdf } from "./document";

const MARGINS: Record<string, number> = { none: 0, small: 10 * MM_TO_PT, large: 25 * MM_TO_PT };

async function embed(doc: PDFDocument, blob: Blob, mime: string): Promise<PDFImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (mime === "image/jpeg") {
    const orientation = readExif(bytes)?.orientation ?? 1;
    if (orientation === 1) return doc.embedJpg(bytes);
  } else if (mime === "image/png") {
    return doc.embedPng(bytes);
  }
  // Other formats (and rotated JPEGs): decode with the browser and re-encode.
  const bitmap = await decodeImage(blob);
  const hasAlpha = mime !== "image/jpeg";
  const canvas = bitmapToCanvas(bitmap);
  bitmap.close();
  const out = await encodeCanvas(canvas, hasAlpha ? "png" : "jpeg", 0.92);
  const outBytes = new Uint8Array(await out.arrayBuffer());
  return hasAlpha ? doc.embedPng(outBytes) : doc.embedJpg(outBytes);
}

export async function imagesToPdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const doc = await PDFDocument.create();
  const size = str(options, "pageSize", "fit");
  const orientation = str(options, "orientation", "auto");
  const margin = MARGINS[str(options, "margin", "small")] ?? 0;

  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Adding ${inputs[i].name}`, step: i + 1, totalSteps: inputs.length });
    const blob = await asBlob(inputs[i]);
    const image = await embed(doc, blob, await detectImageMime(blob));
    // Images are placed at 96 DPI for "fit" pages (px → pt).
    const iw = image.width * 0.75;
    const ih = image.height * 0.75;
    let pw: number;
    let ph: number;
    if (size === "fit") {
      pw = iw + margin * 2;
      ph = ih + margin * 2;
    } else {
      const [a, b] = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
      const landscape = orientation === "landscape" || (orientation === "auto" && iw > ih);
      [pw, ph] = landscape ? [b, a] : [a, b];
    }
    const page = doc.addPage([pw, ph]);
    const s = Math.min((pw - margin * 2) / iw, (ph - margin * 2) / ih, size === "fit" ? 1 : Infinity);
    const w = iw * s;
    const h = ih * s;
    page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  const name = inputs.length === 1 ? deriveFileName(inputs[0].name, null, "pdf") : "images.pdf";
  return { files: [toProcessedFile(name, "application/pdf", await savePdf(doc))] };
}
