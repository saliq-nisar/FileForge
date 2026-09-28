import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FontSet, safeText } from "@/services/pdf/fonts";
import { hexToRgb, PAGE_SIZES } from "@/services/pdf/document";
import type { Align, Block, DocumentModel, Inline } from "./model";

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface Segment {
  text: string;
  font: PDFFont;
  color: string;
  width: number;
}

interface Line {
  segs: Segment[];
  width: number;
}

async function loadFonts(doc: PDFDocument, family: "sans" | "serif"): Promise<Fonts> {
  if (family === "sans") {
    // Liberation Sans: Arial-compatible metrics, broad Unicode coverage, ATS-safe.
    const set = new FontSet(doc, "sans");
    try {
      return { regular: await set.unicode("regular"), bold: await set.unicode("bold"), italic: await set.unicode("italic") };
    } catch {
      return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), italic: await doc.embedFont(StandardFonts.HelveticaOblique) };
    }
  }
  return { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold), italic: await doc.embedFont(StandardFonts.TimesRomanItalic) };
}

class PdfRenderer {
  private page!: PDFPage;
  private y = 0;
  private readonly W: number;
  private readonly H: number;
  private readonly m: number;
  private readonly bottom: number;
  readonly pages: PDFPage[] = [];

  constructor(private doc: PDFDocument, private model: DocumentModel, private fonts: Fonts) {
    [this.W, this.H] = PAGE_SIZES[model.pageSize];
    this.m = model.theme.margin;
    this.bottom = this.H - this.m - (model.footer ? 18 : 0);
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([this.W, this.H]);
    this.pages.push(this.page);
    this.y = this.m;
  }

  private ensure(h: number, allowBreak: boolean) {
    if (allowBreak && this.y + h > this.bottom && this.y > this.m + 1) this.newPage();
  }

  private font(r: Inline): PDFFont {
    return r.bold ? this.fonts.bold : r.italic ? this.fonts.italic : this.fonts.regular;
  }

  /** Word-wrap mixed-style runs into lines. */
  layout(runs: Inline[], width: number, size: number, baseColor: string): Line[] {
    const lines: Line[] = [];
    let cur: Line = { segs: [], width: 0 };
    const push = () => {
      // Drop trailing whitespace from the line.
      const last = cur.segs[cur.segs.length - 1];
      if (last && /^\s+$/.test(last.text)) {
        cur.width -= last.width;
        cur.segs.pop();
      }
      lines.push(cur);
      cur = { segs: [], width: 0 };
    };
    for (const run of runs) {
      const font = this.font(run);
      const color = run.color ?? baseColor;
      const parts = safeText(font, run.text).split(/(\n|\s+)/).filter((p) => p !== "");
      for (const part of parts) {
        if (part === "\n") {
          push();
          continue;
        }
        const w = font.widthOfTextAtSize(part, size);
        if (/^\s+$/.test(part)) {
          if (cur.segs.length === 0) continue;
          cur.segs.push({ text: " ", font, color, width: font.widthOfTextAtSize(" ", size) });
          cur.width += font.widthOfTextAtSize(" ", size);
          continue;
        }
        if (cur.width + w > width && cur.segs.length) push();
        if (w > width) {
          // Hard-break very long tokens (URLs).
          let chunk = "";
          for (const ch of part) {
            const cw = font.widthOfTextAtSize(chunk + ch, size);
            if (cw > width && chunk) {
              cur.segs.push({ text: chunk, font, color, width: font.widthOfTextAtSize(chunk, size) });
              cur.width += font.widthOfTextAtSize(chunk, size);
              push();
              chunk = ch;
            } else chunk += ch;
          }
          cur.segs.push({ text: chunk, font, color, width: font.widthOfTextAtSize(chunk, size) });
          cur.width += font.widthOfTextAtSize(chunk, size);
        } else {
          cur.segs.push({ text: part, font, color, width: w });
          cur.width += w;
        }
      }
    }
    if (cur.segs.length || lines.length === 0) push();
    return lines;
  }

  private drawLine(line: Line, x: number, width: number, size: number, align: Align, draw: boolean) {
    const lh = size * this.model.theme.lineHeight;
    if (draw) {
      const ascent = this.fonts.regular.heightAtSize(size, { descender: false });
      let cx = align === "center" ? x + (width - line.width) / 2 : align === "right" ? x + width - line.width : x;
      const baseline = this.y + (lh - size) / 2 + ascent;
      for (const s of line.segs) {
        if (s.text.trim()) this.page.drawText(s.text, { x: cx, y: this.H - baseline, size, font: s.font, color: hexToRgb(s.color) });
        cx += s.width;
      }
    }
    this.y += lh;
  }

  private text(runs: Inline[], x: number, width: number, size: number, color: string, align: Align, draw: boolean, allowBreak: boolean) {
    const lh = size * this.model.theme.lineHeight;
    for (const line of this.layout(runs, width, size, color)) {
      if (draw) this.ensure(lh, allowBreak);
      this.drawLine(line, x, width, size, align, draw);
    }
  }

  /** Render (or measure, when draw=false) blocks. Returns the consumed height. */
  blocks(blocks: Block[], x: number, width: number, draw: boolean, allowBreak = true): number {
    const start = this.y;
    const startPage = this.pages.length;
    const t = this.model.theme;
    blocks.forEach((b, index) => {
      switch (b.type) {
        case "heading": {
          const size = b.size ?? (b.level === 1 ? t.size * 2 : b.level === 2 ? t.size * 1.2 : t.size * 1.05);
          const before = index === 0 ? 0 : b.level === 1 ? t.size * 0.4 : b.level === 2 ? t.size * 1.1 : t.size * 0.6;
          const lh = size * t.lineHeight;
          if (draw) this.ensure(before + lh + t.size * 3, allowBreak); // keep with following content
          this.y += before;
          const text = b.uppercase ? b.text.toUpperCase() : b.text;
          this.text([{ text, bold: true, color: b.color ?? t.text }], x, width, size, b.color ?? t.text, b.align ?? "left", draw, allowBreak);
          if (b.rule) {
            if (draw) this.page.drawLine({ start: { x, y: this.H - this.y - 1 }, end: { x: x + width, y: this.H - this.y - 1 }, thickness: 0.75, color: hexToRgb(b.color ?? t.accent) });
            this.y += 3;
          }
          this.y += t.size * 0.3;
          break;
        }
        case "paragraph": {
          const size = b.size ?? t.size;
          this.text(b.runs, x, width, size, b.color ?? t.text, b.align ?? "left", draw, allowBreak);
          this.y += b.spaceAfter ?? t.size * 0.45;
          break;
        }
        case "list": {
          const size = b.size ?? t.size;
          const indent = size * 1.1;
          for (const item of b.items) {
            const lines = this.layout(item, width - indent, size, t.text);
            lines.forEach((line, i) => {
              if (draw) this.ensure(size * t.lineHeight, allowBreak);
              if (i === 0 && draw) {
                const ascent = this.fonts.regular.heightAtSize(size, { descender: false });
                const lh = size * t.lineHeight;
                this.page.drawText(safeText(this.fonts.regular, "•"), { x, y: this.H - (this.y + (lh - size) / 2 + ascent), size, font: this.fonts.regular, color: hexToRgb(t.text) });
              }
              this.drawLine(line, x + indent, width - indent, size, "left", draw);
            });
            this.y += size * 0.2;
          }
          this.y += t.size * 0.25;
          break;
        }
        case "table": {
          const size = b.size ?? t.size * 0.95;
          const pad = size * 0.45;
          const total = b.columns.reduce((a, c) => a + c.width, 0);
          const widths = b.columns.map((c) => (c.width / total) * width);
          const rowHeight = (cells: string[], bold: boolean) =>
            Math.max(...cells.map((c, i) => this.layout([{ text: c, bold }], widths[i] - pad * 2, size, t.text).length)) * size * t.lineHeight + pad * 2;
          const drawRow = (cells: string[], header: boolean, zebra: boolean) => {
            const h = rowHeight(cells, header);
            if (draw) {
              this.ensure(h, allowBreak);
              if (header && b.headerBg) this.page.drawRectangle({ x, y: this.H - this.y - h, width, height: h, color: hexToRgb(b.headerBg) });
              else if (zebra) this.page.drawRectangle({ x, y: this.H - this.y - h, width, height: h, color: rgb(0.965, 0.965, 0.97) });
            }
            const top = this.y;
            let cx = x;
            cells.forEach((cell, i) => {
              this.y = top + pad;
              this.text([{ text: cell, bold: header }], cx + pad, widths[i] - pad * 2, size, header ? (b.headerColor ?? t.text) : t.text, b.columns[i].align ?? "left", draw, false);
              cx += widths[i];
            });
            this.y = top + h;
            if (draw && b.borders !== false) this.page.drawLine({ start: { x, y: this.H - this.y }, end: { x: x + width, y: this.H - this.y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.87) });
          };
          const header = b.columns.map((c) => c.header);
          const hh = rowHeight(header, true);
          if (draw) this.ensure(hh + rowHeight(b.rows[0] ?? [""], false), allowBreak);
          drawRow(header, true, false);
          b.rows.forEach((row, i) => {
            if (draw && allowBreak && this.y + rowHeight(row, false) > this.bottom) {
              this.newPage();
              drawRow(header, true, false); // repeat header on the new page
            }
            drawRow(row, false, Boolean(b.zebra && i % 2 === 1));
          });
          this.y += t.size * 0.6;
          break;
        }
        case "columns": {
          const gap = b.gap ?? 24;
          const total = b.columns.reduce((a, c) => a + c.width, 0);
          const avail = width - gap * (b.columns.length - 1);
          const widths = b.columns.map((c) => (c.width / total) * avail);
          const top = this.y;
          const heights = b.columns.map((c, i) => {
            this.y = top;
            return this.blocks(c.blocks, 0, widths[i], false, false);
          });
          this.y = top;
          const h = Math.max(0, ...heights);
          if (draw) this.ensure(h, allowBreak);
          const drawTop = this.y;
          let cx = x;
          b.columns.forEach((c, i) => {
            this.y = drawTop;
            this.blocks(c.blocks, cx, widths[i], draw, false);
            cx += widths[i] + gap;
          });
          this.y = drawTop + h;
          break;
        }
        case "keyValue": {
          const size = b.size ?? t.size;
          const w = width * (b.width ?? 1);
          const kx = b.align === "right" ? x + width - w : x;
          b.rows.forEach(([k, v], i) => {
            const last = b.emphasizeLast && i === b.rows.length - 1;
            const s = last ? size * 1.15 : size;
            const lh = s * t.lineHeight;
            if (draw) {
              this.ensure(lh + (last ? 6 : 0), allowBreak);
              if (last) {
                this.page.drawLine({ start: { x: kx, y: this.H - this.y - 2 }, end: { x: kx + w, y: this.H - this.y - 2 }, thickness: 0.75, color: hexToRgb(t.accent) });
              }
            }
            if (last) this.y += 5;
            const top = this.y;
            this.text([{ text: k, bold: last, color: last ? t.text : t.muted }], kx, w * 0.55, s, t.muted, "left", draw, false);
            const after = this.y;
            this.y = top;
            this.text([{ text: v, bold: last }], kx + w * 0.4, w * 0.6, s, t.text, "right", draw, false);
            this.y = Math.max(after, this.y) + s * 0.15;
          });
          this.y += t.size * 0.4;
          break;
        }
        case "spacer":
          this.y += b.size;
          break;
        case "divider":
          if (draw) {
            this.ensure(8, allowBreak);
            this.page.drawLine({ start: { x, y: this.H - this.y - 4 }, end: { x: x + width, y: this.H - this.y - 4 }, thickness: b.thickness ?? 0.75, color: hexToRgb(b.color ?? "#d4d4d8") });
          }
          this.y += 8 + t.size * 0.3;
          break;
        case "image": {
          if (draw) this.ensure(b.height, allowBreak);
          if (draw) this.pendingImages.push({ page: this.page, b, x: b.align === "right" ? x + width - b.width : b.align === "center" ? x + (width - b.width) / 2 : x, top: this.y });
          this.y += b.height + t.size * 0.4;
          break;
        }
        case "banner": {
          const titleSize = t.size * 1.9;
          const subSize = t.size;
          const h = titleSize * 1.3 + (b.subtitle ? subSize * 1.5 : 0) + 28;
          if (draw) {
            this.ensure(h, allowBreak);
            this.page.drawRectangle({ x, y: this.H - this.y - h, width, height: h, color: hexToRgb(b.background) });
          }
          const top = this.y;
          this.y += 14;
          this.text([{ text: b.title, bold: true }], x + 18, width - 36, titleSize, b.color, b.align ?? "left", draw, false);
          if (b.subtitle) this.text([{ text: b.subtitle }], x + 18, width - 36, subSize, b.color, b.align ?? "left", draw, false);
          this.y = top + h + t.size * 0.8;
          break;
        }
      }
    });
    // Measured height only meaningful within one page (used for columns).
    return this.pages.length === startPage ? this.y - start : this.y;
  }

  pendingImages: Array<{ page: PDFPage; b: Extract<Block, { type: "image" }>; x: number; top: number }> = [];

  async flushImages() {
    for (const { page, b, x, top } of this.pendingImages) {
      try {
        const [header, data] = b.src.split(",");
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const img = header.includes("image/png") ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
        page.drawImage(img, { x, y: this.H - top - b.height, width: b.width, height: b.height });
      } catch {
        /* unsupported logo image — skip rather than fail the export */
      }
    }
  }

  footer() {
    if (!this.model.footer) return;
    const size = this.model.theme.size * 0.8;
    const font = this.fonts.regular;
    const text = safeText(font, this.model.footer);
    this.pages.forEach((p, i) => {
      const label = this.pages.length > 1 ? `${text}${text ? "  ·  " : ""}${i + 1} / ${this.pages.length}` : text;
      const w = font.widthOfTextAtSize(label, size);
      p.drawText(label, { x: (this.W - w) / 2, y: this.m / 2, size, font, color: hexToRgb(this.model.theme.muted) });
    });
  }
}

/** Render a document model to a text-based (selectable, searchable) PDF. */
export async function renderPdf(model: DocumentModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(model.title, { showInWindowTitleBar: true });
  if (model.author) doc.setAuthor(model.author);
  if (model.subject) doc.setSubject(model.subject);
  if (model.keywords?.length) doc.setKeywords(model.keywords);
  doc.setCreator("FileForge");
  doc.setProducer("FileForge");
  doc.setLanguage("en");
  const fonts = await loadFonts(doc, model.theme.font);
  const r = new PdfRenderer(doc, model, fonts);
  const m = model.theme.margin;
  r.blocks(model.blocks, m, PAGE_SIZES[model.pageSize][0] - m * 2, true);
  await r.flushImages();
  r.footer();
  return doc.save({ useObjectStreams: true });
}
