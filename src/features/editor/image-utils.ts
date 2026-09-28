import { detectFormat } from "@/lib/file/detect";
import { toast } from "@/stores/toast-store";

/**
 * Validate an image by content, downscale it and return a PNG (transparency)
 * or JPEG data URL suitable for embedding in a PDF.
 */
export async function imageFileToDataUrl(file: File, maxDim = 2000): Promise<{ src: string; width: number; height: number } | null> {
  const format = await detectFormat(file);
  if (format.family !== "image") {
    toast.error("This file format isn't supported.");
    return null;
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const src = format.kind === "jpeg" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
    return { src, width: c.width, height: c.height };
  } catch {
    toast.error("This image couldn't be opened.");
    return null;
  }
}
