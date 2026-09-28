import {
  BlendMode,
  LineCapStyle,
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  degrees,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { AppError } from "@/lib/errors";
import type { DocumentSettings, EditorElement, PdfPage, TextElement } from "@/features/editor/types";
import { hexToRgb, loadPdf, savePdf, visualToPdf } from "@/services/pdf/document";
import { FontSet, safeText, type FontFamily } from "@/services/pdf/fonts";
import { wrapText } from "@/services/pdf/text-layout";

type Pt = { x: number; y: number };

/** Map a point in the element's local (unrotated, top-left) frame to visual page coords. */
function localToVisual(el: EditorElement, lx: number, ly: number): Pt {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const a = (el.rotation * Math.PI) / 180;
  const dx = lx - el.w / 2;
  const dy = ly - el.h / 2;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

function pdfAngle(page: PDFPage, el: EditorElement) {
  return degrees((page.getRotation().angle - el.rotation + 720) % 360);
}

function anchor(page: PDFPage, el: EditorElement, lx: number, ly: number): Pt {
  const v = localToVisual(el, lx, ly);
  return visualToPdf(page, v.x, v.y);
}

const fontWeight = (el: TextElement) => (el.bold ? "bold" : el.italic ? "italic" : "regular") as "bold" | "italic" | "regular";

async function drawText(page: PDFPage, fonts: Record<FontFamily, FontSet>, el: TextElement) {
  const set = fonts[el.font];
  const font: PDFFont = el.font === "sans" ? await set.forText(el.text, fontWeight(el)) : await set.get(fontWeight(el));
  const lines = wrapText(font, el.text, el.fontSize, Math.max(el.w, el.fontSize));
  const lh = el.fontSize * el.lineHeight;
  const ascent = font.heightAtSize(el.fontSize, { descender: false });
  const color = hexToRgb(el.color);
  lines.forEach((line, i) => {
    const text = safeText(font, line);
    const w = font.widthOfTextAtSize(text, el.fontSize);
    const lx = el.align === "center" ? (el.w - w) / 2 : el.align === "right" ? el.w - w : 0;
    const ly = i * lh + (lh - el.fontSize) / 2 + ascent;
    const p = anchor(page, el, lx, ly);
    page.drawText(text, { x: p.x, y: p.y, size: el.fontSize, font, color, opacity: el.opacity, rotate: pdfAngle(page, el) });
  });
}

async function embedDataUrl(doc: PDFDocument, src: string) {
  const [header, data] = src.split(",");
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return header.includes("image/png") ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

function addTextAnnotation(doc: PDFDocument, page: PDFPage, at: Pt, text: string, color: string) {
  const c = hexToRgb(color);
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [at.x, at.y - 20, at.x + 20, at.y],
    Contents: PDFHexString.fromText(text),
    T: PDFHexString.fromText("Comment"),
    Name: "Comment",
    C: [c.red, c.green, c.blue],
    Open: false,
    F: 4,
  });
  const ref = doc.context.register(annot);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

async function drawElement(doc: PDFDocument, page: PDFPage, fonts: Record<FontFamily, FontSet>, el: EditorElement) {
  const rotate = pdfAngle(page, el);
  switch (el.type) {
    case "text":
      return drawText(page, fonts, el);
    case "image": {
      const img = await embedDataUrl(doc, el.src);
      const p = anchor(page, el, 0, el.h);
      page.drawImage(img, { x: p.x, y: p.y, width: el.w, height: el.h, rotate, opacity: el.opacity });
      return;
    }
    case "rect":
    case "whiteout": {
      const p = anchor(page, el, 0, el.h);
      page.drawRectangle({
        x: p.x,
        y: p.y,
        width: el.w,
        height: el.h,
        rotate,
        color: el.fill ? hexToRgb(el.fill) : undefined,
        borderColor: el.type === "whiteout" || el.strokeWidth === 0 ? undefined : hexToRgb(el.stroke),
        borderWidth: el.type === "whiteout" ? 0 : el.strokeWidth,
        opacity: el.opacity,
        borderOpacity: el.opacity,
      });
      return;
    }
    case "ellipse": {
      const c = anchor(page, el, el.w / 2, el.h / 2);
      page.drawEllipse({
        x: c.x,
        y: c.y,
        xScale: el.w / 2,
        yScale: el.h / 2,
        rotate,
        color: el.fill ? hexToRgb(el.fill) : undefined,
        borderColor: el.strokeWidth ? hexToRgb(el.stroke) : undefined,
        borderWidth: el.strokeWidth,
        opacity: el.opacity,
        borderOpacity: el.opacity,
      });
      return;
    }
    case "line":
    case "arrow": {
      const [a, b] = el.points;
      const color = hexToRgb(el.stroke);
      const s = visualToPdf(page, a[0], a[1]);
      const e = visualToPdf(page, b[0], b[1]);
      page.drawLine({ start: s, end: e, thickness: el.strokeWidth, color, opacity: el.opacity, lineCap: LineCapStyle.Round });
      if (el.type === "arrow") {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const len = Math.max(8, el.strokeWidth * 4);
        for (const side of [-1, 1]) {
          const t = [b[0] - len * Math.cos(ang + side * 0.45), b[1] - len * Math.sin(ang + side * 0.45)];
          page.drawLine({ start: e, end: visualToPdf(page, t[0], t[1]), thickness: el.strokeWidth, color, opacity: el.opacity, lineCap: LineCapStyle.Round });
        }
      }
      return;
    }
    case "ink": {
      if (el.points.length < 2) return;
      const path = el.points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
      const origin = visualToPdf(page, 0, 0);
      page.drawSvgPath(path, {
        x: origin.x,
        y: origin.y,
        rotate: degrees(page.getRotation().angle),
        borderColor: hexToRgb(el.stroke),
        borderWidth: el.strokeWidth,
        borderLineCap: LineCapStyle.Round,
        borderOpacity: el.opacity,
      });
      return;
    }
    case "highlight": {
      const p = visualToPdf(page, el.x, el.y + el.h);
      page.drawRectangle({ x: p.x, y: p.y, width: el.w, height: el.h, rotate: degrees(page.getRotation().angle), color: hexToRgb(el.color), opacity: 0.4 * el.opacity, blendMode: BlendMode.Multiply });
      return;
    }
    case "underline":
    case "strike": {
      const y = el.type === "underline" ? el.y + el.h - 1 : el.y + el.h / 2;
      page.drawLine({ start: visualToPdf(page, el.x, y), end: visualToPdf(page, el.x + el.w, y), thickness: Math.max(1, el.h * 0.08), color: hexToRgb(el.color), opacity: el.opacity });
      return;
    }
    case "comment":
      addTextAnnotation(doc, page, visualToPdf(page, el.x, el.y), el.text, el.color);
      return;
    case "stamp": {
      const font = await fonts.sans.forText(el.text, "bold");
      const color = hexToRgb(el.color);
      const p = anchor(page, el, 0, el.h);
      page.drawRectangle({ x: p.x, y: p.y, width: el.w, height: el.h, rotate, borderColor: color, borderWidth: 2.5, opacity: 0, borderOpacity: el.opacity });
      const size = Math.min(el.h * 0.5, (el.w * 0.85) / Math.max(1, font.widthOfTextAtSize(el.text, 1)));
      const tw = font.widthOfTextAtSize(safeText(font, el.text), size);
      const t = anchor(page, el, (el.w - tw) / 2, el.h / 2 + size * 0.35);
      page.drawText(safeText(font, el.text), { x: t.x, y: t.y, size, font, color, opacity: el.opacity, rotate });
      return;
    }
  }
}

/** Build the edited PDF: page order/rotation/blank pages, then every element on top. */
export async function exportEditedPdf(source: Uint8Array | null, pages: PdfPage[], elements: EditorElement[], settings: DocumentSettings): Promise<Uint8Array> {
  if (pages.length === 0) throw new AppError("INVALID_OPTIONS", "A PDF needs at least one page.");
  const out = await PDFDocument.create();
  const src = source ? await loadPdf(source) : null;
  const sources = pages.flatMap((p) => (p.source !== null ? [p.source] : []));
  const copied = src && sources.length ? await out.copyPages(src, sources) : [];
  let c = 0;
  const outPages: PDFPage[] = [];
  for (const p of pages) {
    if (p.source !== null) {
      const page = out.addPage(copied[c++]);
      if (p.rotate) page.setRotation(degrees((page.getRotation().angle + p.rotate) % 360));
      outPages.push(page);
    } else {
      outPages.push(out.addPage([p.baseWidth, p.baseHeight]));
    }
  }
  const fonts: Record<FontFamily, FontSet> = { sans: new FontSet(out, "sans"), serif: new FontSet(out, "serif"), mono: new FontSet(out, "mono") };
  for (let i = 0; i < pages.length; i++) {
    const items = elements.filter((e) => e.pageKey === pages[i].key);
    // Whiteout first so replacement text drawn later stays visible.
    items.sort((a, b) => (a.type === "whiteout" ? -1 : 0) - (b.type === "whiteout" ? -1 : 0));
    for (const el of items) await drawElement(out, outPages[i], fonts, el);
  }
  out.setProducer("FileForge");
  let bytes = await savePdf(out);

  if (settings.watermark.trim() || settings.pageNumbers) {
    const file = { name: "edited.pdf", size: bytes.length, type: "application/pdf", arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer };
    const ctx = { signal: new AbortController().signal, onProgress: () => undefined };
    if (settings.watermark.trim()) {
      const { watermarkPdf } = await import("@/services/pdf/stamp");
      const r = await watermarkPdf([file], { text: settings.watermark.trim(), fontSize: 54, color: "#888888", opacity: settings.watermarkOpacity, rotation: 45, layout: "center", pages: "" }, ctx);
      bytes = new Uint8Array(await r.files[0].blob.arrayBuffer());
    }
    if (settings.pageNumbers) {
      const { addPageNumbers } = await import("@/services/pdf/stamp");
      const f2 = { ...file, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer };
      const r = await addPageNumbers([f2], { position: "bottom-center", format: settings.pageNumberFormat, start: 1, fontSize: 10, skipFirst: false }, ctx);
      bytes = new Uint8Array(await r.files[0].blob.arrayBuffer());
    }
  }
  return bytes;
}
