import { PDFName, PDFOperator, PDFOperatorNames, degrees, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { AppError, throwIfAborted } from "@/lib/errors";
import { deriveFileName, sanitizeFileName } from "@/lib/file/names";
import { describePageError, parsePageSelection } from "@/lib/validation/pages";
import { bool, num, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { toProcessedFile } from "@/services/shared/output";
import { hexToRgb, loadPdf, savePdf, visualSize, visualToPdf } from "./document";
import { FontSet, safeText } from "./fonts";

export interface VisualText {
  text: string;
  /** Baseline start, visual coordinates (top-left origin, y down). */
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: RGB;
  opacity?: number;
  /** Counter-clockwise degrees as seen on screen. */
  angle?: number;
}

/** Draw text in visual (displayed) coordinates on a possibly rotated page. */
export function drawTextVisual(page: PDFPage, t: VisualText): void {
  const p = visualToPdf(page, t.x, t.y);
  const rotation = (page.getRotation().angle + (t.angle ?? 0)) % 360;
  page.drawText(safeText(t.font, t.text), {
    x: p.x,
    y: p.y,
    size: t.size,
    font: t.font,
    color: t.color,
    opacity: t.opacity,
    rotate: degrees(rotation),
  });
}

/** Baseline start so that the text box is centered on (cx, cy) at the given on-screen angle. */
export function centeredStart(font: PDFFont, text: string, size: number, cx: number, cy: number, angleDeg: number) {
  const w = font.widthOfTextAtSize(text, size);
  const h = font.heightAtSize(size, { descender: false });
  const a = (angleDeg * Math.PI) / 180;
  const dir = { x: Math.cos(a), y: -Math.sin(a) };
  const up = { x: -Math.sin(a), y: -Math.cos(a) };
  return { x: cx - (w / 2) * dir.x - (h / 2) * up.x, y: cy - (w / 2) * dir.y - (h / 2) * up.y };
}

/** Wrap drawing in `/Artifact <</Subtype /Watermark>> BDC … EMC` so it can be removed later. */
function withMarkedWatermark(page: PDFPage, draw: () => void): void {
  const props = page.doc.context.obj({ Type: "Pagination", Subtype: "Watermark" });
  page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("Artifact"), props as unknown as PDFName]));
  draw();
  page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
}

function pagesFor(options: ToolOptions, count: number): number[] {
  const pages = parsePageSelection(str(options, "pages"), count);
  if (!pages) throw new AppError("INVALID_OPTIONS", describePageError(count));
  return pages;
}

export async function watermarkPdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const text = str(options, "text").trim();
  if (!text) throw new AppError("INVALID_OPTIONS", "Enter the watermark text.");
  const doc = await loadPdf(inputs[0]);
  const fonts = new FontSet(doc);
  const font = await fonts.forText(text, "bold");
  const size = num(options, "fontSize", 48);
  const color = hexToRgb(str(options, "color", "#d93025"));
  const opacity = num(options, "opacity", 25) / 100;
  const angle = num(options, "rotation", 45);
  const tiled = str(options, "layout") === "tiled";
  const pages = pagesFor(options, doc.getPageCount());

  pages.forEach((i, n) => {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: n / pages.length, message: `Stamping page ${i + 1}`, step: n + 1, totalSteps: pages.length });
    const page = doc.getPage(i);
    const { width, height } = visualSize(page);
    withMarkedWatermark(page, () => {
      const centers: Array<[number, number]> = [];
      if (tiled) {
        const w = font.widthOfTextAtSize(text, size);
        const stepX = Math.max(w * 0.9, size * 4);
        const stepY = Math.max(size * 4, 120);
        for (let y = stepY / 2; y < height + stepY; y += stepY) {
          for (let x = stepX / 2; x < width + stepX; x += stepX) centers.push([x, y]);
        }
      } else {
        centers.push([width / 2, height / 2]);
      }
      for (const [cx, cy] of centers) {
        const s = centeredStart(font, text, size, cx, cy, angle);
        drawTextVisual(page, { text, x: s.x, y: s.y, size, font, color, opacity, angle });
      }
    });
  });
  return { files: [toProcessedFile(deriveFileName(inputs[0].name, "watermarked", "pdf"), "application/pdf", await savePdf(doc))] };
}

type Align = "left" | "center" | "right";

function placeLine(page: PDFPage, font: PDFFont, text: string, size: number, align: Align, vertical: "top" | "bottom", color: RGB, margin: number) {
  const { width, height } = visualSize(page);
  const safe = safeText(font, text);
  const w = font.widthOfTextAtSize(safe, size);
  const x = align === "left" ? margin : align === "right" ? width - margin - w : (width - w) / 2;
  const y = vertical === "top" ? margin + size * 0.8 : height - margin;
  drawTextVisual(page, { text: safe, x, y, size, font, color });
}

export async function addPageNumbers(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const doc = await loadPdf(inputs[0]);
  const fonts = new FontSet(doc);
  const size = num(options, "fontSize", 10);
  const format = str(options, "format", "{n}");
  const start = num(options, "start", 1);
  const skipFirst = bool(options, "skipFirst");
  const [vertical, horizontal] = str(options, "position", "bottom-center").split("-") as ["top" | "bottom", Align];
  const total = doc.getPageCount();
  const numbered = skipFirst ? total - 1 : total;
  const color = hexToRgb("#222222");

  for (const [i, page] of doc.getPages().entries()) {
    throwIfAborted(ctx.signal);
    if (skipFirst && i === 0) continue;
    const n = start + (skipFirst ? i - 1 : i);
    const label = format.replace("{n}", String(n)).replace("{total}", String(numbered + start - 1));
    placeLine(page, await fonts.forText(label), label, size, horizontal, vertical, color, 28);
    ctx.onProgress({ ratio: i / total, message: `Numbering page ${i + 1}` });
  }
  return { files: [toProcessedFile(deriveFileName(inputs[0].name, "numbered", "pdf"), "application/pdf", await savePdf(doc))] };
}

export async function addHeaderFooter(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const header = str(options, "header").trim();
  const footer = str(options, "footer").trim();
  if (!header && !footer) throw new AppError("INVALID_OPTIONS", "Enter a header or a footer.");
  const doc = await loadPdf(inputs[0]);
  const fonts = new FontSet(doc);
  const size = num(options, "fontSize", 9);
  const color = hexToRgb(str(options, "color", "#444444"));
  const total = doc.getPageCount();
  const date = new Date().toLocaleDateString();
  const fileName = sanitizeFileName(inputs[0].name);
  const fill = (t: string, page: number) =>
    t.replaceAll("{page}", String(page)).replaceAll("{total}", String(total)).replaceAll("{date}", date).replaceAll("{filename}", fileName);
  const headerFont = header ? await fonts.forText(fill(header, total)) : null;
  const footerFont = footer ? await fonts.forText(fill(footer, total)) : null;

  doc.getPages().forEach((page, i) => {
    throwIfAborted(ctx.signal);
    if (header && headerFont) placeLine(page, headerFont, fill(header, i + 1), size, str(options, "headerAlign", "center") as Align, "top", color, 24);
    if (footer && footerFont) placeLine(page, footerFont, fill(footer, i + 1), size, str(options, "footerAlign", "center") as Align, "bottom", color, 24);
    ctx.onProgress({ ratio: i / total, message: `Page ${i + 1} of ${total}` });
  });
  return { files: [toProcessedFile(deriveFileName(inputs[0].name, null, "pdf"), "application/pdf", await savePdf(doc))] };
}
