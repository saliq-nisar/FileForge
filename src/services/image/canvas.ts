import { AppError } from "@/lib/errors";
import { MAX_IMAGE_PIXELS } from "@/lib/constants/limits";

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export type EncodableFormat = "jpeg" | "png" | "webp" | "avif";

export const FORMAT_MIME: Record<EncodableFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const FORMAT_EXT: Record<EncodableFormat, string> = { jpeg: "jpg", png: "png", webp: "webp", avif: "avif" };

/** Works in Web Workers (OffscreenCanvas) and on the main thread. */
export function createCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w * h > MAX_IMAGE_PIXELS) {
    throw new AppError("FILE_TOO_LARGE", "This image is too large to process in the browser (over 100 megapixels).");
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new AppError("BROWSER_UNSUPPORTED");
}

export function context2d(canvas: AnyCanvas): Ctx2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: false }) as Ctx2D | null;
  if (!ctx) throw new AppError("BROWSER_UNSUPPORTED");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Decode any browser-supported image, honoring EXIF orientation. */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      bitmap.close();
      throw new AppError("FILE_TOO_LARGE", "This image is too large to process in the browser (over 100 megapixels).");
    }
    return bitmap;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const hint = /tiff/.test(blob.type) ? " TIFF images can only be opened in Safari; convert them to PNG first or use OCR." : "";
    throw new AppError("UNSUPPORTED_FORMAT", `This image couldn't be decoded by your browser.${hint}`, { cause: error });
  }
}

const encodeSupport = new Map<EncodableFormat, Promise<boolean>>();

/** Browsers silently fall back to PNG for unsupported types — detect that. */
export function canEncode(format: EncodableFormat): Promise<boolean> {
  let p = encodeSupport.get(format);
  if (!p) {
    p = (async () => {
      try {
        // Encoding needs an initialized rendering context (Chrome throws otherwise).
        const probe = createCanvas(2, 2);
        const ctx = context2d(probe);
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, 2, 2);
        const blob = await canvasToBlobRaw(probe, FORMAT_MIME[format], 0.8);
        return blob.type === FORMAT_MIME[format];
      } catch {
        return false;
      }
    })();
    encodeSupport.set(format, p);
  }
  return p;
}

async function canvasToBlobRaw(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality),
  );
}

export async function encodeCanvas(canvas: AnyCanvas, format: EncodableFormat, quality = 0.85): Promise<Blob> {
  const mime = FORMAT_MIME[format];
  const blob = await canvasToBlobRaw(canvas, mime, format === "png" ? undefined : quality);
  if (blob.type !== mime) {
    throw new AppError(
      "BROWSER_UNSUPPORTED",
      `Your browser can't create ${format.toUpperCase()} images. Choose another format, or try a browser that supports ${format.toUpperCase()} encoding.`,
    );
  }
  return blob;
}

/** Draw a bitmap onto a fresh canvas, optionally scaled and over a background color. */
export function bitmapToCanvas(bitmap: ImageBitmap | AnyCanvas, width = bitmap.width, height = bitmap.height, background?: string): AnyCanvas {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Map a detected input MIME to an encodable output format (GIF/BMP/TIFF → PNG). */
export function sameFormatAs(mime: string): EncodableFormat {
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  return "png";
}
