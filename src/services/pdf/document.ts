import { PDFDocument, rgb, type RGB } from "pdf-lib";
import { AppError } from "@/lib/errors";
import type { InputFile } from "@/types/files";
import { readBytes } from "@/services/shared/output";

/** Load a PDF with pdf-lib, mapping failures to friendly errors. */
export async function loadPdf(input: InputFile | Uint8Array, opts: { allowEncrypted?: boolean } = {}): Promise<PDFDocument> {
  const bytes = input instanceof Uint8Array ? input : await readBytes(input);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: opts.allowEncrypted ?? false, updateMetadata: false });
  } catch (error) {
    const message = error instanceof Error ? `${error.name} ${error.message}` : "";
    if (/encrypt/i.test(message)) throw new AppError("ENCRYPTED_PDF", undefined, { cause: error });
    throw new AppError("CORRUPTED_PDF", undefined, { cause: error });
  }
  // pdf-lib is lenient: a damaged file can "load" without a usable page tree.
  try {
    if (doc.getPageCount() === 0) throw new Error("no pages");
  } catch (error) {
    throw new AppError("CORRUPTED_PDF", undefined, { cause: error });
  }
  return doc;
}

export async function savePdf(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

export const MM_TO_PT = 72 / 25.4;

export const PAGE_SIZES: Record<string, [number, number]> = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
};

/** Page size as displayed (after /Rotate), useful for placing overlay content. */
export function visualSize(page: { getSize(): { width: number; height: number }; getRotation(): { angle: number } }): {
  width: number;
  height: number;
  rotation: number;
} {
  const { width, height } = page.getSize();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  return rotation === 90 || rotation === 270 ? { width: height, height: width, rotation } : { width, height, rotation };
}

/**
 * Convert a point in visual (displayed, top-left origin) coordinates to the page's
 * unrotated PDF user space (bottom-left origin), accounting for /Rotate and the crop box.
 */
export function visualToPdf(
  page: { getCropBox(): { x: number; y: number; width: number; height: number }; getRotation(): { angle: number } },
  vx: number,
  vy: number,
): { x: number; y: number } {
  const box = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  let x: number;
  let y: number;
  switch (r) {
    case 90:
      x = vy;
      y = vx;
      break;
    case 180:
      x = box.width - vx;
      y = vy;
      break;
    case 270:
      x = box.width - vy;
      y = box.height - vx;
      break;
    default:
      x = vx;
      y = box.height - vy;
  }
  return { x: box.x + x, y: box.y + y };
}
