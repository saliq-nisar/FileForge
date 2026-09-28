import { PDFDocument, PDFName, PDFArray, PDFDict, decodePDFRawStream, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { editPages, applyPagePlan, mergePdfs, rotatePdf, splitPdf } from "@/services/pdf/pages";
import { addHeaderFooter, addPageNumbers, watermarkPdf } from "@/services/pdf/stamp";
import { cropPdf, editMetadata, flattenPdf, readPdfMetadata, removeWatermark, resizePdf, stripWatermarkBlocks } from "@/services/pdf/transform";
import { visualToPdf } from "@/services/pdf/document";
import { exportEditedPdf } from "@/services/editor/export";
import { DEFAULT_SETTINGS } from "@/features/editor/state";
import { blobBytes, ctx, fileFrom, makePdf } from "../helpers";

async function load(b: Blob) {
  return PDFDocument.load(await blobBytes(b));
}

async function contentOf(doc: PDFDocument, pageIndex: number): Promise<string> {
  const page = doc.getPage(pageIndex);
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((r) => doc.context.lookup(r!))
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"))
    .join("\n");
}

describe("page operations", () => {
  it("merges PDFs in order", async () => {
    const a = fileFrom(await makePdf(2), "a.pdf");
    const b = fileFrom(await makePdf(3), "b.pdf");
    const r = await mergePdfs([a, b], {}, ctx());
    expect(r.files).toHaveLength(1);
    expect(r.files[0].name).toBe("a-merged.pdf");
    expect((await load(r.files[0].blob)).getPageCount()).toBe(5);
  });

  it("refuses to merge fewer than two files", async () => {
    await expect(mergePdfs([fileFrom(await makePdf(1), "a.pdf")], {}, ctx())).rejects.toBeInstanceOf(AppError);
  });

  it("splits by ranges, fixed size and single pages", async () => {
    const f = fileFrom(await makePdf(5), "doc.pdf");
    const ranges = await splitPdf([f], { mode: "ranges", ranges: "1-2, 3-5" }, ctx());
    expect(ranges.files.map((x) => x.name)).toEqual(["doc-pages-1-2.pdf", "doc-pages-3-5.pdf"]);
    expect((await splitPdf([f], { mode: "every", every: 2 }, ctx())).files).toHaveLength(3);
    expect((await splitPdf([f], { mode: "single" }, ctx())).files).toHaveLength(5);
    await expect(splitPdf([f], { mode: "ranges", ranges: "9" }, ctx())).rejects.toThrow(/between 1 and 5/);
  });

  it("rotates selected pages", async () => {
    const r = await rotatePdf([fileFrom(await makePdf(3), "d.pdf")], { angle: "90", pages: "2" }, ctx());
    const d = await load(r.files[0].blob);
    expect(d.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0]);
  });

  it("deletes, extracts, duplicates and inserts pages", async () => {
    const f = fileFrom(await makePdf(4), "d.pdf");
    expect((await load((await editPages([f], { mode: "delete", pages: "2-3" }, ctx())).files[0].blob)).getPageCount()).toBe(2);
    expect((await load((await editPages([f], { mode: "extract", pages: "1,4" }, ctx())).files[0].blob)).getPageCount()).toBe(2);
    expect((await editPages([f], { mode: "extract", pages: "1,4", separate: true }, ctx())).files).toHaveLength(2);
    expect((await load((await editPages([f], { mode: "duplicate", pages: "1", copies: 2 }, ctx())).files[0].blob)).getPageCount()).toBe(6);
    expect((await load((await editPages([f], { mode: "insert", after: 0, count: 2 }, ctx())).files[0].blob)).getPageCount()).toBe(6);
    await expect(editPages([f], { mode: "delete", pages: "1-4" }, ctx())).rejects.toThrow(/every page/);
  });

  it("applies an organizer plan with reorder, rotation and blank pages", async () => {
    const out = await applyPagePlan(await makePdf(3), [{ source: 2, rotate: 90 }, { blank: true, width: 300, height: 400 }, { source: 0, rotate: 0 }]);
    const d = await PDFDocument.load(out);
    expect(d.getPageCount()).toBe(3);
    expect(d.getPage(0).getRotation().angle).toBe(90);
    expect(d.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
  });

  it("rejects corrupted PDFs with a friendly error", async () => {
    await expect(mergePdfs([fileFrom("%PDF-1.7 garbage", "a.pdf"), fileFrom("%PDF-1.4 x", "b.pdf")], {}, ctx())).rejects.toMatchObject({ code: "CORRUPTED_PDF" });
  });
});

describe("stamping and transforms", () => {
  it("adds a removable watermark, then removes it", async () => {
    const wm = await watermarkPdf([fileFrom(await makePdf(2), "d.pdf")], { text: "DRAFT", fontSize: 40, color: "#ff0000", opacity: 30, rotation: 45, layout: "tiled", pages: "" }, ctx());
    const stamped = await load(wm.files[0].blob);
    expect(await contentOf(stamped, 0)).toMatch(/\/Artifact <<[^>]*\/Watermark[^>]*>> BDC/);
    const cleaned = await removeWatermark([fileFrom(await blobBytes(wm.files[0].blob), "d.pdf")], {}, ctx());
    expect(cleaned.notes?.[0]).toMatch(/Removed 2 watermark/);
    expect(await contentOf(await load(cleaned.files[0].blob), 0)).not.toMatch(/Watermark/);
  });

  it("explains when no removable watermark exists", async () => {
    await expect(removeWatermark([fileFrom(await makePdf(1), "d.pdf")], {}, ctx())).rejects.toThrow(/No removable watermark/);
  });

  it("strips nested marked-content blocks only", () => {
    const src = "q BT (keep) Tj ET Q\n/Artifact <</Subtype /Watermark >> BDC /OC /x BDC 1 0 0 1 0 0 cm EMC EMC\n(after) Tj";
    const r = stripWatermarkBlocks(src);
    expect(r.removed).toBe(1);
    expect(r.content).toContain("(keep)");
    expect(r.content).toContain("(after)");
    expect(r.content).not.toContain("Watermark");
  });

  it("adds page numbers and header/footer text", async () => {
    const n = await addPageNumbers([fileFrom(await makePdf(3), "d.pdf")], { position: "bottom-center", format: "Page {n} of {total}", start: 1, fontSize: 10, skipFirst: false }, ctx());
    expect(await contentOf(await load(n.files[0].blob), 2)).toContain("Tj");
    const hf = await addHeaderFooter([fileFrom(await makePdf(2), "d.pdf")], { header: "{filename}", headerAlign: "left", footer: "{page}/{total}", footerAlign: "right", fontSize: 9, color: "#444444" }, ctx());
    expect((await load(hf.files[0].blob)).getPageCount()).toBe(2);
    await expect(addHeaderFooter([fileFrom(await makePdf(1), "d.pdf")], { header: "", footer: "" }, ctx())).rejects.toThrow(/header or a footer/);
  });

  it("edits, reads and clears metadata", async () => {
    const f = fileFrom(await makePdf(1), "d.pdf");
    const r = await editMetadata([f], { clear: false, title: "Quarterly report", author: "Ada", subject: "", keywords: "q1, finance", creator: "" });
    const meta = await readPdfMetadata(fileFrom(await blobBytes(r.files[0].blob), "d.pdf"));
    expect(meta).toMatchObject({ title: "Quarterly report", author: "Ada" });
    const cleared = await editMetadata([fileFrom(await blobBytes(r.files[0].blob), "d.pdf")], { clear: true });
    expect((await load(cleared.files[0].blob)).getTitle()).toBeUndefined();
  });

  it("crops and resizes pages", async () => {
    const f = fileFrom(await makePdf(1), "d.pdf");
    const crop = await load((await cropPdf([f], { top: 10, right: 10, bottom: 10, left: 10, pages: "" }, ctx())).files[0].blob);
    expect(Math.round(crop.getPage(0).getCropBox().width)).toBe(Math.round(595 - (20 * 72) / 25.4));
    const resized = await load((await resizePdf([fileFrom(await makePdf(1, { size: [612, 792] }), "d.pdf")], { size: "a4", orientation: "auto" }, ctx())).files[0].blob);
    expect(resized.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });

  it("reports honestly when there are no form fields to flatten", async () => {
    const r = await flattenPdf([fileFrom(await makePdf(1), "d.pdf")]);
    expect(r.notes?.[0]).toMatch(/no form fields/);
  });
});

describe("rotation-aware coordinates", () => {
  it("maps visual points to PDF space for every page rotation", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 100]);
    const at = (r: number) => {
      page.setRotation({ type: "degrees", angle: r } as never);
      return visualToPdf(page, 10, 20);
    };
    expect(at(0)).toEqual({ x: 10, y: 80 });
    expect(at(90)).toEqual({ x: 20, y: 10 });
    expect(at(180)).toEqual({ x: 190, y: 20 });
    expect(at(270)).toEqual({ x: 180, y: 90 });
  });
});

describe("PDF editor export", () => {
  it("draws text/shapes, adds real comment annotations and reorders pages", async () => {
    const pages = [
      { key: "p2", source: 1, rotate: 0, baseWidth: 595, baseHeight: 842 },
      { key: "p1", source: 0, rotate: 0, baseWidth: 595, baseHeight: 842 },
    ];
    const bytes = await exportEditedPdf(
      await makePdf(2),
      pages,
      [
        { id: "t", type: "text", pageKey: "p2", x: 50, y: 50, w: 200, h: 20, rotation: 0, opacity: 1, text: "Hello editor", font: "sans", fontSize: 14, bold: false, italic: false, color: "#111111", align: "left", lineHeight: 1.3 },
        { id: "r", type: "rect", pageKey: "p2", x: 40, y: 40, w: 100, h: 50, rotation: 15, opacity: 1, stroke: "#ff0000", strokeWidth: 2, fill: null },
        { id: "c", type: "comment", pageKey: "p1", x: 100, y: 100, w: 20, h: 20, rotation: 0, opacity: 1, text: "Please review", color: "#facc15" },
        { id: "i", type: "ink", pageKey: "p1", x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, points: [[0, 0], [10, 10]], stroke: "#000000", strokeWidth: 2 },
      ],
      { ...DEFAULT_SETTINGS, pageNumbers: true },
    );
    const d = await PDFDocument.load(bytes);
    expect(d.getPageCount()).toBe(2);
    const annots = d.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray);
    const note = annots.lookup(0, PDFDict);
    expect(note.lookup(PDFName.of("Subtype"))?.toString()).toBe("/Text");
  });
});
