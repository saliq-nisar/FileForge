import { AppError, throwIfAborted } from "@/lib/errors";
import { detectFormat } from "@/lib/file/detect";
import type { ProcessContext } from "@/types/processing";
import type { OcrEngine } from "./engine";

export interface OcrDocumentResult {
  pages: Array<{ text: string; confidence: number }>;
  /** Searchable PDF bytes combining all pages, if requested. */
  pdf?: Uint8Array;
}

/**
 * Run OCR over a PDF (each page rendered at 250 DPI) or an image, and optionally
 * assemble a searchable PDF from the per-page results.
 */
export async function runOcr(
  file: File,
  engine: OcrEngine,
  opts: { searchablePdf: boolean },
  ctx: ProcessContext,
): Promise<OcrDocumentResult> {
  const format = await detectFormat(file);
  const pages: OcrDocumentResult["pages"] = [];
  const pdfParts: Uint8Array[] = [];

  const recognizeOne = async (image: Blob | HTMLCanvasElement, index: number, total: number) => {
    const result = await engine.recognize(image, {
      searchablePdf: opts.searchablePdf,
      onProgress: (r, status) =>
        ctx.onProgress({ ratio: (index + r) / total, message: total > 1 ? `${status} — page ${index + 1} of ${total}` : status, step: index + 1, totalSteps: total }),
    });
    pages.push({ text: result.text, confidence: result.confidence });
    if (result.pdf) pdfParts.push(result.pdf);
  };

  if (format.kind === "pdf") {
    const { closePdf, openPdf, renderPage } = await import("@/services/pdf/pdfjs");
    const doc = await openPdf(await file.arrayBuffer());
    try {
      if (doc.numPages > 200) throw new AppError("FILE_TOO_LARGE", "OCR in the browser supports up to 200 pages at a time.");
      for (let i = 1; i <= doc.numPages; i++) {
        throwIfAborted(ctx.signal);
        ctx.onProgress({ ratio: (i - 1) / doc.numPages, message: `Preparing page ${i} of ${doc.numPages}` });
        const page = await doc.getPage(i);
        const canvas = await renderPage(page, 250 / 72, { background: "#ffffff", signal: ctx.signal });
        page.cleanup();
        await recognizeOne(canvas, i - 1, doc.numPages);
        canvas.width = canvas.height = 0;
      }
    } finally {
      await closePdf(doc);
    }
  } else if (format.family === "image") {
    throwIfAborted(ctx.signal);
    await recognizeOne(file, 0, 1);
  } else {
    throw new AppError("UNSUPPORTED_FORMAT");
  }

  let pdf: Uint8Array | undefined;
  if (opts.searchablePdf && pdfParts.length) {
    if (pdfParts.length === 1) pdf = pdfParts[0];
    else {
      const { PDFDocument } = await import("pdf-lib");
      const out = await PDFDocument.create();
      for (const part of pdfParts) {
        const src = await PDFDocument.load(part);
        (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      }
      pdf = await out.save();
    }
  }
  return { pages, pdf };
}
