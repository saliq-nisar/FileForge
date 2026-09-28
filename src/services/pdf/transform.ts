import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  degrees,
  type PDFPage,
} from "pdf-lib";
import { AppError, throwIfAborted } from "@/lib/errors";
import { deriveFileName } from "@/lib/file/names";
import { describePageError, parsePageSelection } from "@/lib/validation/pages";
import { bool, num, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { toProcessedFile } from "@/services/shared/output";
import { MM_TO_PT, PAGE_SIZES, loadPdf, savePdf, visualSize } from "./document";

const PDF_MIME = "application/pdf";

export async function cropPdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const doc = await loadPdf(inputs[0]);
  const pages = parsePageSelection(str(options, "pages"), doc.getPageCount());
  if (!pages) throw new AppError("INVALID_OPTIONS", describePageError(doc.getPageCount()));
  const vis = ["top", "right", "bottom", "left"].map((k) => num(options, k, 0) * MM_TO_PT) as [number, number, number, number];
  for (const i of pages) {
    throwIfAborted(ctx.signal);
    const page = doc.getPage(i);
    const r = ((page.getRotation().angle % 360) + 360) % 360;
    // Map visual [top, right, bottom, left] margins onto the unrotated page sides.
    const [vt, vr, vb, vl] = vis;
    const [t, rt, b, l] =
      r === 90 ? [vr, vb, vl, vt] : r === 180 ? [vb, vl, vt, vr] : r === 270 ? [vl, vt, vr, vb] : [vt, vr, vb, vl];
    const box = page.getCropBox();
    const w = box.width - l - rt;
    const h = box.height - t - b;
    if (w < 36 || h < 36) throw new AppError("INVALID_OPTIONS", `The margins are larger than page ${i + 1}.`);
    page.setCropBox(box.x + l, box.y + b, w, h);
  }
  return { files: [toProcessedFile(deriveFileName(inputs[0].name, "cropped", "pdf"), PDF_MIME, await savePdf(doc))] };
}

export async function resizePdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const src = await loadPdf(inputs[0]);
  const out = await PDFDocument.create();
  const [baseW, baseH] = PAGE_SIZES[str(options, "size", "a4")] ?? PAGE_SIZES.a4;
  const orientation = str(options, "orientation", "auto");
  const embedded = await out.embedPages(src.getPages(), src.getPages().map((p) => {
    const b = p.getCropBox();
    return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
  }));
  src.getPages().forEach((page, i) => {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / src.getPageCount(), message: `Resizing page ${i + 1}` });
    const v = visualSize(page);
    const landscape = orientation === "landscape" || (orientation === "auto" && v.width > v.height);
    const [tw, th] = landscape ? [baseH, baseW] : [baseW, baseH];
    const target = out.addPage([tw, th]);
    const s = Math.min(tw / v.width, th / v.height);
    const ox = (tw - v.width * s) / 2;
    const oy = (th - v.height * s) / 2;
    const { width: W, height: H } = page.getCropBox();
    const r = v.rotation;
    const place =
      r === 90 ? { x: ox, y: oy + W * s, rotate: -90 }
      : r === 180 ? { x: ox + W * s, y: oy + H * s, rotate: -180 }
      : r === 270 ? { x: ox + H * s, y: oy, rotate: 90 }
      : { x: ox, y: oy, rotate: 0 };
    target.drawPage(embedded[i], { x: place.x, y: place.y, xScale: s, yScale: s, rotate: degrees(place.rotate) });
  });
  return { files: [toProcessedFile(deriveFileName(inputs[0].name, "resized", "pdf"), PDF_MIME, await savePdf(out))] };
}

/** Current metadata, used to prefill the metadata form. */
export async function readPdfMetadata(input: InputFile): Promise<Record<string, string>> {
  const doc = await loadPdf(input, { allowEncrypted: true });
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
  };
}

export async function editMetadata(inputs: InputFile[], options: ToolOptions): Promise<ProcessResult> {
  const doc = await loadPdf(inputs[0]);
  if (bool(options, "clear")) {
    // getInfoDict is internal in pdf-lib's typings but stable at runtime.
    const info = (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
    for (const key of info.keys()) info.delete(key);
    doc.catalog.delete(PDFName.of("Metadata"));
  } else {
    doc.setTitle(str(options, "title"));
    doc.setAuthor(str(options, "author"));
    doc.setSubject(str(options, "subject"));
    doc.setKeywords(str(options, "keywords").split(",").map((k) => k.trim()).filter(Boolean));
    doc.setCreator(str(options, "creator"));
    doc.setModificationDate(new Date());
  }
  return { files: [toProcessedFile(deriveFileName(inputs[0].name, null, "pdf"), PDF_MIME, await savePdf(doc))] };
}

export async function flattenPdf(inputs: InputFile[]): Promise<ProcessResult> {
  const doc = await loadPdf(inputs[0]);
  const form = doc.getForm();
  const count = form.getFields().length;
  if (count === 0) {
    return {
      files: [toProcessedFile(deriveFileName(inputs[0].name, "flattened", "pdf"), PDF_MIME, await savePdf(doc))],
      notes: ["This PDF has no form fields, so there was nothing to flatten."],
    };
  }
  form.flatten({ updateFieldAppearances: true });
  return {
    files: [toProcessedFile(deriveFileName(inputs[0].name, "flattened", "pdf"), PDF_MIME, await savePdf(doc))],
    notes: [`${count} form field${count === 1 ? "" : "s"} flattened.`],
  };
}

// ---------------- watermark removal ----------------

function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Remove `/Artifact <</Subtype /Watermark …>> BDC … EMC` blocks from a content stream.
 * Returns the new content and how many blocks were removed.
 */
export function stripWatermarkBlocks(content: string): { content: string; removed: number } {
  const start = /\/Artifact\s*<<(?:(?!>>)[\s\S])*\/Watermark(?:(?!>>)[\s\S])*>>\s*BDC/g;
  let removed = 0;
  let result = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = start.exec(content))) {
    const blockStart = m.index;
    const ops = /(?:^|[\s\]>)])(BDC|BMC|EMC)(?=[\s[<(/]|$)/g;
    ops.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    let op: RegExpExecArray | null;
    while ((op = ops.exec(content))) {
      depth += op[1] === "EMC" ? -1 : 1;
      if (depth === 0) {
        end = op.index + op[0].length;
        break;
      }
    }
    if (end < 0) break; // unbalanced — leave the rest untouched
    result += content.slice(cursor, blockStart);
    cursor = end;
    start.lastIndex = end;
    removed++;
  }
  result += content.slice(cursor);
  return { content: result, removed };
}

function removeWatermarkAnnotations(page: PDFPage): number {
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annots) return 0;
  let removed = 0;
  for (let i = annots.size() - 1; i >= 0; i--) {
    const annot = annots.lookupMaybe(i, PDFDict);
    const subtype = annot?.lookupMaybe(PDFName.of("Subtype"), PDFName);
    if (subtype?.asString() === "/Watermark") {
      annots.remove(i);
      removed++;
    }
  }
  return removed;
}

function pageContentStreams(page: PDFPage): PDFRawStream[] {
  const contents = page.node.get(PDFName.of("Contents"));
  const ctx = page.doc.context;
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs
    .map((r) => (r instanceof PDFRef ? ctx.lookup(r) : r))
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream);
}

export async function removeWatermark(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const doc = await loadPdf(inputs[0]);
  let removed = 0;
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / pages.length, message: `Scanning page ${i + 1}` });
    const page = pages[i];
    removed += removeWatermarkAnnotations(page);
    const streams = pageContentStreams(page);
    if (streams.length === 0) continue;
    let combined = "";
    try {
      combined = streams.map((s) => bytesToLatin1(decodePDFRawStream(s).decode())).join("\n");
    } catch {
      continue; // unsupported filter — skip this page rather than corrupt it
    }
    const stripped = stripWatermarkBlocks(combined);
    if (stripped.removed > 0) {
      removed += stripped.removed;
      const stream = doc.context.flateStream(latin1ToBytes(stripped.content));
      page.node.set(PDFName.of("Contents"), doc.context.register(stream));
    }
  }
  if (removed === 0) {
    throw new AppError(
      "PROCESSING_FAILED",
      "No removable watermark was found. This watermark is part of the page content itself and can't be separated safely.",
    );
  }
  return {
    files: [toProcessedFile(deriveFileName(inputs[0].name, "no-watermark", "pdf"), PDF_MIME, await savePdf(doc))],
    notes: [`Removed ${removed} watermark element${removed === 1 ? "" : "s"}.`],
  };
}
