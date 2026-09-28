import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { AppError } from "@/lib/errors";

type PdfjsLib = typeof import("pdfjs-dist");

let libPromise: Promise<PdfjsLib> | null = null;

/** Lazily load PDF.js (never part of the initial bundle). Browser only. */
export function getPdfjs(): Promise<PdfjsLib> {
  if (!libPromise) {
    libPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
      return lib;
    });
    libPromise.catch(() => {
      libPromise = null;
    });
  }
  return libPromise;
}

export async function openPdf(data: ArrayBuffer | Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const lib = await getPdfjs();
  // PDF.js transfers the buffer to its worker; pass a copy so callers keep theirs.
  const copy = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  try {
    return await lib.getDocument({
      data: copy,
      password,
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
      wasmUrl: "/vendor/pdfjs/wasm/",
      enableXfa: false,
    }).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") throw new AppError("ENCRYPTED_PDF", undefined, { cause: error });
    throw new AppError("CORRUPTED_PDF", undefined, { cause: error });
  }
}

/** Release a document and its worker resources. */
export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  await doc.loadingTask.destroy();
}

/** Render a page at the given scale (1 = 72 DPI) to a new canvas. */
export async function renderPage(
  page: PDFPageProxy,
  scale: number,
  opts: { background?: string; signal?: AbortSignal; rotation?: number } = {},
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale, rotation: ((page.rotate + (opts.rotation ?? 0)) % 360 + 360) % 360 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError("BROWSER_UNSUPPORTED");
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const task = page.render({ canvas, canvasContext: ctx, viewport, background: opts.background });
  const onAbort = () => task.cancel();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await task.promise;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
  return canvas;
}

export interface ExtractedPage {
  /** Paragraphs of text, in reading order as provided by the PDF. */
  paragraphs: string[];
  charCount: number;
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}

/** Extract text grouped into lines and paragraphs using item positions. */
export async function extractPageText(page: PDFPageProxy): Promise<ExtractedPage> {
  const content = await page.getTextContent();
  const paragraphs: string[] = [];
  let line = "";
  let para: string[] = [];
  let lastY: number | null = null;
  let lastHeight = 10;
  let charCount = 0;

  const flushLine = () => {
    const t = line.replace(/\s+/g, " ").trim();
    if (t) para.push(t);
    line = "";
  };
  const flushPara = () => {
    flushLine();
    if (para.length) paragraphs.push(para.join(" ").replace(/(\w)- (\w)/g, "$1$2"));
    para = [];
  };

  for (const item of content.items) {
    if (!isTextItem(item)) continue;
    const y = item.transform[5];
    const h = Math.abs(item.transform[3]) || item.height || lastHeight;
    if (lastY !== null && Math.abs(y - lastY) > h * 0.5) {
      const gap = Math.abs(lastY - y);
      if (gap > Math.max(h, lastHeight) * 1.9) flushPara();
      else flushLine();
    }
    line += item.str;
    charCount += item.str.trim().length;
    if (item.hasEOL) {
      line += " ";
    }
    lastY = y;
    lastHeight = h;
  }
  flushPara();
  return { paragraphs, charCount };
}

export async function extractAllText(
  doc: PDFDocumentProxy,
  onPage?: (index: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ExtractedPage[]> {
  const pages: ExtractedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (signal?.aborted) throw new AppError("CANCELLED");
    onPage?.(i, doc.numPages);
    const page = await doc.getPage(i);
    pages.push(await extractPageText(page));
    page.cleanup();
  }
  return pages;
}
