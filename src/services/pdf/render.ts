import { AppError, throwIfAborted } from "@/lib/errors";
import { deriveFileName, sanitizeFileName, stripExtension } from "@/lib/file/names";
import { describePageError, parsePageSelection } from "@/lib/validation/pages";
import { bool, num, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { escapeHtml } from "@/lib/utils/html";
import { toProcessedFile } from "@/services/shared/output";
import { FORMAT_EXT, FORMAT_MIME, encodeCanvas, type EncodableFormat } from "@/services/image/canvas";
import { closePdf, extractAllText, openPdf, renderPage } from "./pdfjs";

/** PDF → JPG/PNG/WebP (browser main thread: PDF.js renders to canvas). */
export async function pdfToImages(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const doc = await openPdf(await input.arrayBuffer());
  try {
    const pages = parsePageSelection(str(options, "pages"), doc.numPages);
    if (!pages) throw new AppError("INVALID_OPTIONS", describePageError(doc.numPages));
    const format = str(options, "format", "jpeg") as EncodableFormat;
    const scale = Number(str(options, "dpi", "150")) / 72;
    const quality = num(options, "quality", 88) / 100;
    const stem = stripExtension(sanitizeFileName(input.name));
    const files = [];
    for (let n = 0; n < pages.length; n++) {
      throwIfAborted(ctx.signal);
      const i = pages[n];
      ctx.onProgress({ ratio: n / pages.length, message: `Rendering page ${i + 1} of ${doc.numPages}`, step: n + 1, totalSteps: pages.length });
      const page = await doc.getPage(i + 1);
      const canvas = await renderPage(page, scale, { background: format === "png" ? undefined : "#ffffff", signal: ctx.signal });
      page.cleanup();
      const blob = await encodeCanvas(canvas, format, quality);
      canvas.width = canvas.height = 0; // release memory early
      files.push(toProcessedFile(`${stem}-page-${i + 1}.${FORMAT_EXT[format]}`, FORMAT_MIME[format], blob));
    }
    return { files };
  } finally {
    await closePdf(doc);
  }
}

export async function pdfToText(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const doc = await openPdf(await input.arrayBuffer());
  try {
    const pages = await extractAllText(doc, (i, t) => ctx.onProgress({ ratio: i / t, message: `Reading page ${i} of ${t}` }), ctx.signal);
    const markers = bool(options, "pageMarkers", true);
    const text = pages
      .map((p, i) => (markers ? `--- Page ${i + 1} ---\n\n` : "") + p.paragraphs.join("\n\n"))
      .join("\n\n");
    const chars = pages.reduce((a, p) => a + p.charCount, 0);
    const notes = chars < 20 * pages.length ? ["Very little text was found. If this is a scanned document, use OCR to extract its text."] : [];
    return { files: [toProcessedFile(deriveFileName(input.name, null, "txt"), "text/plain;charset=utf-8", text)], notes, text };
  } finally {
    await closePdf(doc);
  }
}


export async function pdfToHtml(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const doc = await openPdf(await input.arrayBuffer());
  try {
    const pages = await extractAllText(doc, (i, t) => ctx.onProgress({ ratio: i / t, message: `Reading page ${i} of ${t}` }), ctx.signal);
    const title = escapeHtml(stripExtension(sanitizeFileName(input.name)));
    const body = pages
      .map((p, i) => `<section class="page" aria-label="Page ${i + 1}">\n${p.paragraphs.map((t) => `  <p>${escapeHtml(t)}</p>`).join("\n")}\n</section>`)
      .join("\n");
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  .page { padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #ddd; }
</style>
</head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>
`;
    return { files: [toProcessedFile(deriveFileName(input.name, null, "html"), "text/html;charset=utf-8", html)] };
  } finally {
    await closePdf(doc);
  }
}

export async function pdfToDocx(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const doc = await openPdf(await input.arrayBuffer());
  try {
    const pages = await extractAllText(doc, (i, t) => ctx.onProgress({ ratio: (i / t) * 0.8, message: `Reading page ${i} of ${t}` }), ctx.signal);
    const chars = pages.reduce((a, p) => a + p.charCount, 0);
    if (chars === 0) {
      throw new AppError("PROCESSING_FAILED", "No text was found in this PDF. If it's a scan, run OCR first.");
    }
    ctx.onProgress({ ratio: 0.9, message: "Building Word document" });
    const { Document, Packer, Paragraph, PageBreak, TextRun } = await import("docx");
    const children = pages.flatMap((p, i) => [
      ...p.paragraphs.map((t) => new Paragraph({ children: [new TextRun(t)], spacing: { after: 160 } })),
      ...(i < pages.length - 1 ? [new Paragraph({ children: [new PageBreak()] })] : []),
    ]);
    const file = new Document({
      creator: "FileForge",
      title: stripExtension(sanitizeFileName(input.name)),
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      sections: [{ children }],
    });
    const blob = await Packer.toBlob(file);
    return {
      files: [toProcessedFile(deriveFileName(input.name, null, "docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", blob)],
      notes: ["Text and paragraphs were converted. Layout, images and tables from the PDF are not included."],
    };
  } finally {
    await closePdf(doc);
  }
}
