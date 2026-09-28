import { PDFDocument, degrees } from "pdf-lib";
import { AppError, throwIfAborted } from "@/lib/errors";
import { deriveFileName, stripExtension, sanitizeFileName } from "@/lib/file/names";
import { describePageError, parsePageRanges, parsePageSelection } from "@/lib/validation/pages";
import { bool, num, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { toProcessedFile } from "@/services/shared/output";
import { loadPdf, savePdf } from "./document";

const PDF_MIME = "application/pdf";

function pdfResult(name: string, bytes: Uint8Array) {
  return toProcessedFile(name, PDF_MIME, bytes);
}

function selection(input: string, count: number): number[] {
  const pages = parsePageSelection(input, count);
  if (!pages || pages.length === 0) throw new AppError("INVALID_OPTIONS", describePageError(count));
  return pages;
}

export async function mergePdfs(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  if (inputs.length < 2) throw new AppError("TOO_FEW_FILES", "Add at least two PDFs to merge.");
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Adding ${inputs[i].name}`, step: i + 1, totalSteps: inputs.length });
    const src = await loadPdf(inputs[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  ctx.onProgress({ ratio: 0.95, message: "Saving merged PDF" });
  return { files: [pdfResult(deriveFileName(inputs[0].name, "merged", "pdf"), await savePdf(out))] };
}

async function extractToNewDoc(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return savePdf(out);
}

export async function splitPdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const src = await loadPdf(input);
  const count = src.getPageCount();
  const mode = str(options, "mode", "ranges");
  let groups: number[][];
  if (mode === "single") {
    groups = src.getPageIndices().map((i) => [i]);
  } else if (mode === "every") {
    const n = Math.max(1, Math.floor(num(options, "every", 1)));
    groups = [];
    for (let i = 0; i < count; i += n) groups.push(src.getPageIndices().slice(i, i + n));
  } else {
    const parsed = parsePageRanges(str(options, "ranges"), count);
    if (!parsed || !str(options, "ranges").trim()) {
      throw new AppError("INVALID_OPTIONS", `Enter page ranges between 1 and ${count}, for example "1-3, 4-${count}".`);
    }
    groups = parsed;
  }
  if (groups.length === 1 && groups[0].length === count) {
    throw new AppError("INVALID_OPTIONS", "That selection is the whole document — choose smaller ranges to split.");
  }
  const stem = stripExtension(sanitizeFileName(input.name));
  const files = [];
  for (let g = 0; g < groups.length; g++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: g / groups.length, message: `Creating file ${g + 1} of ${groups.length}`, step: g + 1, totalSteps: groups.length });
    const group = groups[g];
    const label = group.length === 1 ? `page-${group[0] + 1}` : `pages-${group[0] + 1}-${group[group.length - 1] + 1}`;
    files.push(pdfResult(`${stem}-${label}.pdf`, await extractToNewDoc(src, group)));
  }
  return { files };
}

export async function rotatePdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const angle = Number(str(options, "angle", "90"));
  const files = [];
  for (let f = 0; f < inputs.length; f++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: f / inputs.length, message: `Rotating ${inputs[f].name}` });
    const doc = await loadPdf(inputs[f]);
    for (const i of selection(str(options, "pages"), doc.getPageCount())) {
      const page = doc.getPage(i);
      page.setRotation(degrees((page.getRotation().angle + angle) % 360));
    }
    files.push(pdfResult(deriveFileName(inputs[f].name, "rotated", "pdf"), await savePdf(doc)));
  }
  return { files };
}

/** Delete / extract / duplicate / insert blank pages. */
export async function editPages(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const doc = await loadPdf(input);
  const count = doc.getPageCount();
  const mode = str(options, "mode");
  ctx.onProgress({ message: "Updating pages" });

  if (mode === "delete") {
    const del = new Set(selection(str(options, "pages"), count));
    if (!str(options, "pages").trim()) throw new AppError("INVALID_OPTIONS", "Enter the pages you want to delete.");
    if (del.size >= count) throw new AppError("INVALID_OPTIONS", "You can't delete every page of a PDF.");
    [...del].sort((a, b) => b - a).forEach((i) => doc.removePage(i));
    return { files: [pdfResult(deriveFileName(input.name, "edited", "pdf"), await savePdf(doc))] };
  }

  if (mode === "extract") {
    if (!str(options, "pages").trim()) throw new AppError("INVALID_OPTIONS", "Enter the pages you want to extract.");
    const pages = selection(str(options, "pages"), count);
    if (bool(options, "separate")) {
      const stem = stripExtension(sanitizeFileName(input.name));
      const files = [];
      for (const i of pages) {
        throwIfAborted(ctx.signal);
        files.push(pdfResult(`${stem}-page-${i + 1}.pdf`, await extractToNewDoc(doc, [i])));
      }
      return { files };
    }
    return { files: [pdfResult(deriveFileName(input.name, "extracted", "pdf"), await extractToNewDoc(doc, pages))] };
  }

  if (mode === "duplicate") {
    if (!str(options, "pages").trim()) throw new AppError("INVALID_OPTIONS", "Enter the pages you want to duplicate.");
    const dup = new Set(selection(str(options, "pages"), count));
    const copies = Math.max(1, Math.min(50, Math.floor(num(options, "copies", 1))));
    const order: number[] = [];
    for (let i = 0; i < count; i++) {
      order.push(i);
      if (dup.has(i)) for (let c = 0; c < copies; c++) order.push(i);
    }
    return { files: [pdfResult(deriveFileName(input.name, "edited", "pdf"), await extractToNewDoc(doc, order))] };
  }

  if (mode === "insert") {
    const after = Math.floor(num(options, "after", 0));
    const n = Math.max(1, Math.min(100, Math.floor(num(options, "count", 1))));
    if (after < 0 || after > count) throw new AppError("INVALID_OPTIONS", `Choose a position between 0 and ${count}.`);
    const ref = doc.getPage(Math.max(0, Math.min(count - 1, after === 0 ? 0 : after - 1)));
    const { width, height } = ref.getSize();
    for (let k = 0; k < n; k++) doc.insertPage(after + k, [width, height]);
    return { files: [pdfResult(deriveFileName(input.name, "edited", "pdf"), await savePdf(doc))] };
  }

  throw new AppError("INVALID_OPTIONS");
}

/** One entry of an organizer plan: a page from the source (with extra rotation) or a blank page. */
export type PagePlanItem = { source: number; rotate: number } | { blank: true; width: number; height: number };

/** Build a new PDF from a page plan produced by the visual organizer. */
export async function applyPagePlan(bytes: Uint8Array, plan: PagePlanItem[]): Promise<Uint8Array> {
  if (plan.length === 0) throw new AppError("INVALID_OPTIONS", "A PDF needs at least one page.");
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const count = src.getPageCount();
  const sources = plan.flatMap((p) => ("source" in p ? [p.source] : []));
  if (sources.some((s) => s < 0 || s >= count || !Number.isInteger(s))) throw new AppError("INVALID_OPTIONS");
  const copied = await out.copyPages(src, sources);
  let c = 0;
  for (const item of plan) {
    if ("source" in item) {
      const page = out.addPage(copied[c++]);
      const extra = ((item.rotate % 360) + 360) % 360;
      if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    } else {
      out.addPage([item.width, item.height]);
    }
  }
  return savePdf(out);
}
