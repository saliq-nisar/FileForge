import { AppError, throwIfAborted } from "@/lib/errors";
import { sniffKind } from "@/lib/file/detect";
import { FORMATS } from "@/lib/file/formats";
import { deriveFileName } from "@/lib/file/names";
import { bool, num, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile, ProcessedFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { toProcessedFile } from "@/services/shared/output";
import {
  FORMAT_EXT,
  FORMAT_MIME,
  bitmapToCanvas,
  canEncode,
  context2d,
  createCanvas,
  decodeImage,
  encodeCanvas,
  sameFormatAs,
  type AnyCanvas,
  type EncodableFormat,
} from "./canvas";
import { boxBlur, grayscale, sharpen } from "./filters";

export async function asBlob(input: InputFile): Promise<Blob> {
  return input instanceof Blob ? input : new Blob([await input.arrayBuffer()]);
}

/** MIME from the file's bytes — never from its name or declared type. */
export async function detectImageMime(blob: Blob): Promise<string> {
  const kind = sniffKind(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
  if (!kind || kind === "zip-container" || FORMATS[kind].family !== "image") {
    throw new AppError("UNSUPPORTED_FORMAT");
  }
  return FORMATS[kind].mime;
}

async function eachImage(
  inputs: InputFile[],
  ctx: ProcessContext,
  fn: (blob: Blob, mime: string, input: InputFile) => Promise<ProcessedFile>,
): Promise<ProcessResult> {
  const files: ProcessedFile[] = [];
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Processing ${inputs[i].name}`, step: i + 1, totalSteps: inputs.length });
    const blob = await asBlob(inputs[i]);
    files.push(await fn(blob, await detectImageMime(blob), inputs[i]));
  }
  return { files };
}

function applyGrayscale(canvas: AnyCanvas): void {
  const ctx = context2d(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayscale(img.data);
  ctx.putImageData(img, 0, 0);
}

// ---------------- convert ----------------

export async function convertImages(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const format = str(options, "format", "png") as EncodableFormat;
  if (!(await canEncode(format))) {
    throw new AppError("BROWSER_UNSUPPORTED", `Your browser can't create ${format.toUpperCase()} images. Try Chrome or Edge, or choose another format.`);
  }
  const quality = num(options, "quality", 85) / 100;
  // JPEG has no transparency; use the chosen background (white by default).
  const background = format === "jpeg" ? str(options, "background", "#ffffff") : undefined;
  return eachImage(inputs, ctx, async (blob, _mime, input) => {
    const bitmap = await decodeImage(blob);
    const canvas = bitmapToCanvas(bitmap, bitmap.width, bitmap.height, background);
    bitmap.close();
    if (str(options, "color") === "grayscale") applyGrayscale(canvas);
    const out = await encodeCanvas(canvas, format, quality);
    return toProcessedFile(deriveFileName(input.name, null, FORMAT_EXT[format]), FORMAT_MIME[format], out);
  });
}

// ---------------- compress ----------------

async function encodeUnder(canvas: AnyCanvas, format: EncodableFormat, quality: number, maxBytes: number): Promise<Blob> {
  let blob = await encodeCanvas(canvas, format, quality);
  if (!maxBytes || blob.size <= maxBytes) return blob;
  if (format !== "png") {
    // Binary search on quality first.
    let lo = 0.05;
    let hi = quality;
    let best: Blob | null = null;
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2;
      const b = await encodeCanvas(canvas, format, q);
      if (b.size <= maxBytes) {
        best = b;
        lo = q;
      } else {
        hi = q;
      }
    }
    if (best) return best;
    blob = await encodeCanvas(canvas, format, 0.05);
  }
  // Still too big: scale dimensions down proportionally.
  let current = canvas;
  for (let i = 0; i < 8 && blob.size > maxBytes; i++) {
    const scale = Math.max(0.3, Math.sqrt(maxBytes / blob.size) * 0.95);
    current = bitmapToCanvas(current, current.width * scale, current.height * scale);
    blob = await encodeCanvas(current, format, format === "png" ? undefined : Math.min(quality, 0.6));
  }
  return blob;
}

export async function compressImages(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const quality = num(options, "quality", 75) / 100;
  const maxBytes = num(options, "maxSizeKb", 0) * 1000;
  const maxW = num(options, "maxWidth", 0);
  const maxH = num(options, "maxHeight", 0);
  const notes = new Set<string>();

  const result = await eachImage(inputs, ctx, async (blob, mime, input) => {
    const chosen = str(options, "format", "original");
    const format: EncodableFormat = chosen === "original" ? sameFormatAs(mime) : (chosen as EncodableFormat);
    if (!(await canEncode(format))) throw new AppError("BROWSER_UNSUPPORTED", `Your browser can't create ${format.toUpperCase()} images.`);
    const bitmap = await decodeImage(blob);
    let w = bitmap.width;
    let h = bitmap.height;
    const scale = Math.min(1, maxW ? maxW / w : 1, maxH ? maxH / h : 1);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    // For PNG, "quality" below 100% reduces dimensions since PNG is lossless.
    if (format === "png" && quality < 0.95 && !maxBytes) {
      const s = Math.max(0.4, quality + 0.15);
      w = Math.round(w * Math.min(1, s));
      h = Math.round(h * Math.min(1, s));
    }
    const canvas = bitmapToCanvas(bitmap, w, h, format === "jpeg" ? "#ffffff" : undefined);
    bitmap.close();
    const out = await encodeUnder(canvas, format, quality, maxBytes);
    const sameFormat = FORMAT_MIME[format] === mime;
    if (maxBytes && out.size > maxBytes) notes.add("Some images couldn't reach the target size without becoming unusable; the smallest reasonable version was kept.");
    if (sameFormat && out.size >= blob.size && !maxBytes && scale === 1) {
      notes.add("Some images were already well optimized — the original was kept because compression made it larger.");
      return toProcessedFile(deriveFileName(input.name, null, FORMAT_EXT[format]), mime, blob);
    }
    return toProcessedFile(deriveFileName(input.name, "compressed", FORMAT_EXT[format]), FORMAT_MIME[format], out);
  });
  return { ...result, notes: [...notes] };
}

// ---------------- edit ----------------

type Anchor = "center" | "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

function anchorPoint(anchor: Anchor, W: number, H: number, w: number, h: number, pad: number): [number, number] {
  const [v, hz] = anchor === "center" ? ["center", "center"] : anchor.split("-");
  const x = hz === "left" ? pad : hz === "right" ? W - w - pad : (W - w) / 2;
  const y = v === "top" ? pad : v === "bottom" ? H - h - pad : (H - h) / 2;
  return [x, y];
}

function drawCaption(canvas: AnyCanvas, text: string, opts: { anchor: Anchor | "tiled"; sizePct: number; color: string; opacity: number; box?: string }): void {
  const ctx = context2d(canvas);
  const W = canvas.width;
  const H = canvas.height;
  const fontSize = Math.max(8, Math.round((Math.min(W, H) * opts.sizePct) / 100));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textBaseline = "top";
  const tw = ctx.measureText(text).width;
  const pad = Math.round(fontSize * 0.6);
  ctx.globalAlpha = opts.opacity;
  if (opts.anchor === "tiled") {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    const stepX = tw + fontSize * 3;
    const stepY = fontSize * 4;
    const R = Math.hypot(W, H);
    ctx.fillStyle = opts.color;
    for (let y = -R; y < R; y += stepY) for (let x = -R; x < R; x += stepX) ctx.fillText(text, x, y);
    ctx.restore();
  } else {
    const boxW = tw + pad * 2;
    const boxH = fontSize + pad * 2;
    const [x, y] = anchorPoint(opts.anchor, W, H, boxW, boxH, Math.round(Math.min(W, H) * 0.03));
    if (opts.box) {
      ctx.fillStyle = opts.box;
      ctx.fillRect(x, y, boxW, boxH);
    }
    ctx.fillStyle = opts.color;
    ctx.fillText(text, x + pad, y + pad);
  }
  ctx.globalAlpha = 1;
}

async function editOne(bitmap: ImageBitmap, options: ToolOptions, mime: string): Promise<AnyCanvas> {
  const op = str(options, "operation");
  const W = bitmap.width;
  const H = bitmap.height;
  switch (op) {
    case "resize": {
      let w: number;
      let h: number;
      if (str(options, "resizeMode") === "percent") {
        const p = num(options, "percent", 50) / 100;
        w = W * p;
        h = H * p;
      } else {
        w = num(options, "width", W) || W;
        h = num(options, "height", 0) || (H * w) / W;
      }
      return bitmapToCanvas(bitmap, w, h);
    }
    case "crop": {
      const t = num(options, "top") / 100, r = num(options, "right") / 100, b = num(options, "bottom") / 100, l = num(options, "left") / 100;
      const cw = W * (1 - l - r);
      const ch = H * (1 - t - b);
      if (cw < 1 || ch < 1) throw new AppError("INVALID_OPTIONS", "The crop removes the whole image.");
      const canvas = createCanvas(cw, ch);
      context2d(canvas).drawImage(bitmap, W * l, H * t, cw, ch, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    case "rotate": {
      const deg = ((num(options, "angle", 90) % 360) + 360) % 360;
      const rad = (deg * Math.PI) / 180;
      const right = deg % 90 === 0;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const nw = right ? (deg % 180 === 0 ? W : H) : W * cos + H * sin;
      const nh = right ? (deg % 180 === 0 ? H : W) : W * sin + H * cos;
      const canvas = createCanvas(nw, nh);
      const ctx = context2d(canvas);
      if (!right && mime !== "image/png") {
        ctx.fillStyle = str(options, "background", "#ffffff");
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(bitmap, -W / 2, -H / 2);
      return canvas;
    }
    case "flip": {
      const dir = str(options, "direction", "horizontal");
      const canvas = createCanvas(W, H);
      const ctx = context2d(canvas);
      ctx.translate(dir !== "vertical" ? W : 0, dir !== "horizontal" ? H : 0);
      ctx.scale(dir !== "vertical" ? -1 : 1, dir !== "horizontal" ? -1 : 1);
      ctx.drawImage(bitmap, 0, 0);
      return canvas;
    }
    case "grayscale": {
      const canvas = bitmapToCanvas(bitmap);
      applyGrayscale(canvas);
      return canvas;
    }
    case "blur":
    case "sharpen": {
      const canvas = bitmapToCanvas(bitmap);
      const ctx = context2d(canvas);
      const img = ctx.getImageData(0, 0, W, H);
      if (op === "blur") img.data.set(boxBlur(img.data, W, H, num(options, "radius", 4)));
      else sharpen(img.data, W, H, num(options, "amount", 50) / 100);
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    case "watermark": {
      const canvas = bitmapToCanvas(bitmap);
      const text = str(options, "text").trim();
      if (!text) throw new AppError("INVALID_OPTIONS", "Enter the watermark text.");
      const pos = str(options, "position", "bottom-right");
      drawCaption(canvas, text, { anchor: pos as Anchor | "tiled", sizePct: num(options, "size", 5), color: str(options, "color", "#ffffff"), opacity: num(options, "opacity", 60) / 100 });
      return canvas;
    }
    case "text": {
      const canvas = bitmapToCanvas(bitmap);
      const text = str(options, "text").trim();
      if (!text) throw new AppError("INVALID_OPTIONS", "Enter the text to add.");
      drawCaption(canvas, text, {
        anchor: str(options, "position", "bottom-center") as Anchor,
        sizePct: num(options, "size", 6),
        color: str(options, "color", "#ffffff"),
        opacity: 1,
        box: bool(options, "box", true) ? str(options, "boxColor", "#000000") : undefined,
      });
      return canvas;
    }
    case "border": {
      const bw = num(options, "width", 20);
      const canvas = createCanvas(W + bw * 2, H + bw * 2);
      const ctx = context2d(canvas);
      ctx.fillStyle = str(options, "color", "#ffffff");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, bw, bw);
      return canvas;
    }
    case "background": {
      const pad = num(options, "padding", 0);
      const canvas = createCanvas(W + pad * 2, H + pad * 2);
      const ctx = context2d(canvas);
      ctx.fillStyle = str(options, "color", "#ffffff");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, pad, pad);
      return canvas;
    }
    case "strip":
      return bitmapToCanvas(bitmap);
    default:
      throw new AppError("INVALID_OPTIONS");
  }
}

export async function editImages(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const op = str(options, "operation");
  let changedFormat = false;
  const result = await eachImage(inputs, ctx, async (blob, mime, input) => {
    let format = sameFormatAs(mime);
    if (!(await canEncode(format))) format = "png";
    if (FORMAT_MIME[format] !== mime) changedFormat = true;
    const bitmap = await decodeImage(blob);
    const canvas = await editOne(bitmap, options, mime);
    bitmap.close();
    const quality = op === "strip" ? 0.95 : 0.92;
    const out = await encodeCanvas(canvas, format, quality);
    return toProcessedFile(deriveFileName(input.name, op === "strip" ? "clean" : "edited", FORMAT_EXT[format]), FORMAT_MIME[format], out);
  });
  return changedFormat ? { ...result, notes: ["Formats your browser can't write (like GIF, BMP or TIFF) are saved as PNG."] } : result;
}
