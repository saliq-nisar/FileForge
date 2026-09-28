import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
import { throwIfAborted } from "@/lib/errors";
import { deriveFileName } from "@/lib/file/names";
import { bool, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { readBytes, toProcessedFile } from "@/services/shared/output";
import { bitmapToCanvas, context2d, createCanvas, encodeCanvas } from "@/services/image/canvas";
import { loadPdf, savePdf } from "./document";

export type CompressionLevel = "low" | "recommended" | "strong";

export const PDF_IMAGE_SETTINGS: Record<Exclude<CompressionLevel, "low">, { maxDim: number; quality: number }> = {
  recommended: { maxDim: 2000, quality: 0.72 },
  strong: { maxDim: 1300, quality: 0.5 },
};

const RASTER_SETTINGS: Record<CompressionLevel, { dpi: number; quality: number }> = {
  low: { dpi: 200, quality: 0.8 },
  recommended: { dpi: 144, quality: 0.68 },
  strong: { dpi: 100, quality: 0.5 },
};

function nameOf(obj: PDFObject | undefined): string | undefined {
  return obj instanceof PDFName ? obj.asString() : undefined;
}

function numOf(obj: PDFObject | undefined): number | undefined {
  return obj instanceof PDFNumber ? obj.asNumber() : undefined;
}

interface Candidate {
  stream: PDFRawStream;
  width: number;
  height: number;
  kind: "jpeg" | "raw";
  components: 1 | 3;
  keepColorSpace?: PDFObject;
}

/** Decide whether an image XObject can be safely recompressed; return its description. */
function inspectImage(doc: PDFDocument, stream: PDFRawStream): Candidate | null {
  const dict = stream.dict;
  if (nameOf(dict.get(PDFName.of("Subtype"))) !== "/Image") return null;
  if (dict.get(PDFName.of("ImageMask")) || dict.get(PDFName.of("Decode")) || dict.get(PDFName.of("Mask"))) return null;
  const width = numOf(dict.lookup(PDFName.of("Width")));
  const height = numOf(dict.lookup(PDFName.of("Height")));
  const bpc = numOf(dict.lookup(PDFName.of("BitsPerComponent")));
  if (!width || !height || width * height < 64 * 64 || stream.contents.length < 16_000) return null;

  const filterObj = dict.lookup(PDFName.of("Filter"));
  const filters = filterObj instanceof PDFArray ? filterObj.asArray().map((f) => nameOf(f)) : [nameOf(filterObj)];
  if (filters.length !== 1) return null;

  const cs = dict.lookup(PDFName.of("ColorSpace"));
  let components: 1 | 3 | undefined;
  let keepColorSpace: PDFObject | undefined;
  const csName = nameOf(cs);
  if (csName === "/DeviceRGB") components = 3;
  else if (csName === "/DeviceGray") components = 1;
  else if (cs instanceof PDFArray && nameOf(cs.get(0)) === "/ICCBased") {
    const profile = doc.context.lookup(cs.get(1));
    const n = profile instanceof PDFRawStream ? numOf(profile.dict.lookup(PDFName.of("N"))) : undefined;
    if (n === 3) {
      components = 3;
      keepColorSpace = dict.get(PDFName.of("ColorSpace"));
    } else if (n === 1) components = 1;
  }
  if (!components) return null; // CMYK, indexed, separation…: leave untouched

  if (filters[0] === "/DCTDecode") return { stream, width, height, kind: "jpeg", components, keepColorSpace };
  if (filters[0] === "/FlateDecode" && bpc === 8) {
    const parms = dict.lookup(PDFName.of("DecodeParms"));
    const predictor = parms instanceof PDFDict ? numOf(parms.lookup(PDFName.of("Predictor"))) : undefined;
    if (predictor && predictor > 1) return null;
    return { stream, width, height, kind: "raw", components, keepColorSpace };
  }
  return null;
}

async function decodeCandidate(c: Candidate): Promise<ImageBitmap | OffscreenCanvas | HTMLCanvasElement | null> {
  if (c.kind === "jpeg") {
    return createImageBitmap(new Blob([c.stream.contents as BlobPart], { type: "image/jpeg" }));
  }
  const raw = decodePDFRawStream(c.stream).decode();
  if (raw.length < c.width * c.height * c.components) return null;
  const canvas = createCanvas(c.width, c.height);
  const ctx = context2d(canvas);
  const img = ctx.createImageData(c.width, c.height);
  const px = img.data;
  for (let i = 0, j = 0; i < c.width * c.height; i++, j += c.components) {
    const o = i * 4;
    if (c.components === 3) {
      px[o] = raw[j];
      px[o + 1] = raw[j + 1];
      px[o + 2] = raw[j + 2];
    } else {
      px[o] = px[o + 1] = px[o + 2] = raw[j];
    }
    px[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Recompress photos inside a PDF as JPEG. Text, vectors and fonts are untouched. */
export async function recompressPdfImages(doc: PDFDocument, level: Exclude<CompressionLevel, "low">, ctx: ProcessContext): Promise<number> {
  const { maxDim, quality } = PDF_IMAGE_SETTINGS[level];
  const entries = doc.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream);
  let replaced = 0;
  for (let n = 0; n < entries.length; n++) {
    throwIfAborted(ctx.signal);
    const [ref, obj] = entries[n];
    const candidate = inspectImage(doc, obj as PDFRawStream);
    if (!candidate) continue;
    ctx.onProgress({ ratio: 0.1 + (n / entries.length) * 0.8, message: "Optimizing images" });
    try {
      const source = await decodeCandidate(candidate);
      if (!source) continue;
      const scale = Math.min(1, maxDim / Math.max(candidate.width, candidate.height));
      const canvas = bitmapToCanvas(source, candidate.width * scale, candidate.height * scale, "#ffffff");
      if ("close" in source) source.close();
      const jpeg = new Uint8Array(await (await encodeCanvas(canvas, "jpeg", quality)).arrayBuffer());
      if (jpeg.length >= candidate.stream.contents.length * 0.9) continue;
      const old = candidate.stream.dict;
      const dict: Record<string, PDFObject | string | number> = {
        Type: "XObject",
        Subtype: "Image",
        Width: canvas.width,
        Height: canvas.height,
        ColorSpace: candidate.keepColorSpace ?? "DeviceRGB",
        BitsPerComponent: 8,
        Filter: "DCTDecode",
      };
      for (const key of ["SMask", "Interpolate", "Intent", "OC", "Metadata"]) {
        const v = old.get(PDFName.of(key));
        if (v) dict[key] = v;
      }
      const stream = doc.context.stream(jpeg, dict as never);
      doc.context.assign(ref, stream);
      replaced++;
    } catch {
      // Undecodable image — keep the original bytes.
    }
  }
  return replaced;
}

/** Replace every page with a JPEG rendering (main thread; uses PDF.js). */
async function rasterize(bytes: Uint8Array, level: CompressionLevel, ctx: ProcessContext): Promise<Uint8Array> {
  const { closePdf, openPdf, renderPage } = await import("./pdfjs");
  const { dpi, quality } = RASTER_SETTINGS[level];
  const src = await openPdf(bytes);
  try {
    const out = await PDFDocument.create();
    for (let i = 1; i <= src.numPages; i++) {
      throwIfAborted(ctx.signal);
      ctx.onProgress({ ratio: i / (src.numPages + 1), message: `Processing page ${i} of ${src.numPages}`, step: i, totalSteps: src.numPages });
      const page = await src.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = await renderPage(page, dpi / 72, { background: "#ffffff", signal: ctx.signal });
      page.cleanup();
      const jpeg = await out.embedJpg(new Uint8Array(await (await encodeCanvas(canvas, "jpeg", quality)).arrayBuffer()));
      canvas.width = canvas.height = 0;
      const p = out.addPage([viewport.width, viewport.height]);
      p.drawImage(jpeg, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }
    return savePdf(out);
  } finally {
    await closePdf(src);
  }
}

export async function compressPdf(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const input = inputs[0];
  const original = await readBytes(input);
  const level = (str(options, "level", "recommended") as CompressionLevel) ?? "recommended";
  let output: Uint8Array;
  const notes: string[] = [];

  if (bool(options, "rasterize")) {
    output = await rasterize(original, level, ctx);
    notes.push("Pages were converted to images: text is no longer selectable.");
  } else {
    ctx.onProgress({ ratio: 0.05, message: "Analyzing document" });
    const doc = await loadPdf(original);
    if (level !== "low") {
      const n = await recompressPdfImages(doc, level, ctx);
      if (n > 0) notes.push(`${n} image${n === 1 ? "" : "s"} optimized. Text and vector graphics were kept intact.`);
    }
    ctx.onProgress({ ratio: 0.92, message: "Saving optimized PDF" });
    output = await savePdf(doc);
  }

  const name = deriveFileName(input.name, "compressed", "pdf");
  if (output.length >= original.length) {
    return {
      files: [toProcessedFile(name, "application/pdf", original)],
      notes: ["This PDF is already well optimized — compressing it further would not make it smaller, so your original file is returned unchanged."],
    };
  }
  return { files: [toProcessedFile(name, "application/pdf", output)], notes };
}
