import type { ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";

export type ProcessorFn = (inputs: InputFile[], options: ToolOptions, ctx: ProcessContext) => Promise<ProcessResult>;

/**
 * - worker: pure computation (pdf-lib, OffscreenCanvas) — runs in a Web Worker.
 * - main: needs DOM APIs (PDF.js canvas rendering, DOMParser) — runs on the main thread.
 */
export type ProcessorThread = "worker" | "main";

interface ProcessorEntry {
  thread: ProcessorThread;
  load: () => Promise<ProcessorFn>;
}

// Every processor is loaded on demand, so heavy libraries never reach the initial bundle.
export const BROWSER_PROCESSORS: Record<string, ProcessorEntry> = {
  "pdf-merge": { thread: "worker", load: () => import("@/services/pdf/pages").then((m) => m.mergePdfs) },
  "pdf-split": { thread: "worker", load: () => import("@/services/pdf/pages").then((m) => m.splitPdf) },
  "pdf-rotate": { thread: "worker", load: () => import("@/services/pdf/pages").then((m) => m.rotatePdf) },
  "pdf-pages": { thread: "worker", load: () => import("@/services/pdf/pages").then((m) => m.editPages) },
  "pdf-watermark": { thread: "worker", load: () => import("@/services/pdf/stamp").then((m) => m.watermarkPdf) },
  "pdf-page-numbers": { thread: "worker", load: () => import("@/services/pdf/stamp").then((m) => m.addPageNumbers) },
  "pdf-header-footer": { thread: "worker", load: () => import("@/services/pdf/stamp").then((m) => m.addHeaderFooter) },
  "pdf-crop": { thread: "worker", load: () => import("@/services/pdf/transform").then((m) => m.cropPdf) },
  "pdf-resize": { thread: "worker", load: () => import("@/services/pdf/transform").then((m) => m.resizePdf) },
  "pdf-metadata": { thread: "worker", load: () => import("@/services/pdf/transform").then((m) => m.editMetadata) },
  "pdf-flatten": { thread: "worker", load: () => import("@/services/pdf/transform").then((m) => m.flattenPdf) },
  "pdf-remove-watermark": { thread: "worker", load: () => import("@/services/pdf/transform").then((m) => m.removeWatermark) },
  "images-to-pdf": { thread: "worker", load: () => import("@/services/pdf/images-to-pdf").then((m) => m.imagesToPdf) },
  "pdf-compress": { thread: "main", load: () => import("@/services/pdf/compress").then((m) => m.compressPdf) },
  "pdf-to-image": { thread: "main", load: () => import("@/services/pdf/render").then((m) => m.pdfToImages) },
  "pdf-to-text": { thread: "main", load: () => import("@/services/pdf/render").then((m) => m.pdfToText) },
  "pdf-to-html": { thread: "main", load: () => import("@/services/pdf/render").then((m) => m.pdfToHtml) },
  "pdf-to-docx": { thread: "main", load: () => import("@/services/pdf/render").then((m) => m.pdfToDocx) },
  "image-convert": { thread: "worker", load: () => import("@/services/image/process").then((m) => m.convertImages) },
  "image-compress": { thread: "worker", load: () => import("@/services/image/process").then((m) => m.compressImages) },
  "image-edit": { thread: "worker", load: () => import("@/services/image/process").then((m) => m.editImages) },
  "docx-to-text": { thread: "main", load: () => import("@/services/document/convert").then((m) => m.docxToText) },
  "docx-to-html": { thread: "main", load: () => import("@/services/document/convert").then((m) => m.docxToHtml) },
  "xlsx-to-csv": { thread: "main", load: () => import("@/services/document/convert").then((m) => m.xlsxToCsv) },
  "csv-to-xlsx": { thread: "main", load: () => import("@/services/document/convert").then((m) => m.csvToXlsx) },
  "office-compress": { thread: "worker", load: () => import("@/services/compression/archive").then((m) => m.compressOffice) },
  "zip-recompress": { thread: "worker", load: () => import("@/services/compression/archive").then((m) => m.recompressZip) },
  "zip-create": { thread: "worker", load: () => import("@/services/compression/archive").then((m) => m.createZip) },
  "auto-compress": { thread: "main", load: () => import("@/services/compression/archive").then((m) => m.autoCompress) },
};

export function hasBrowserProcessor(id: string): boolean {
  return Object.hasOwn(BROWSER_PROCESSORS, id);
}
