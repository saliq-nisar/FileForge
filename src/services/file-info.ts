import type { DetectedFormat, FileMetadata } from "@/types/files";
import { readExif } from "@/lib/file/exif";

function formatDate(d: Date | null | undefined): string | undefined {
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : undefined;
}

function push(details: FileMetadata["details"], label: string, value: string | number | undefined | null) {
  if (value !== undefined && value !== null && String(value).trim() !== "") details.push({ label, value: String(value) });
}

/** Parse PDF "D:YYYYMMDDHHmmSS" dates. */
function pdfDate(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se));
}

/** Collect details for the file information panel. Browser only. */
export async function inspectFile(file: File, format: DetectedFormat): Promise<FileMetadata> {
  const meta: FileMetadata = {
    name: file.name,
    size: file.size,
    format,
    declaredMime: file.type || "not provided",
    lastModified: file.lastModified,
    details: [],
    warnings: [],
  };
  try {
    if (format.kind === "pdf") {
      const { openPdf, closePdf } = await import("@/services/pdf/pdfjs");
      const doc = await openPdf(await file.arrayBuffer());
      try {
        meta.pageCount = doc.numPages;
        const page = await doc.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        meta.width = Math.round(vp.width);
        meta.height = Math.round(vp.height);
        const info = (await doc.getMetadata()).info as unknown as Record<string, unknown>;
        push(meta.details, "Title", info.Title as string);
        push(meta.details, "Author", info.Author as string);
        push(meta.details, "Subject", info.Subject as string);
        push(meta.details, "Keywords", info.Keywords as string);
        push(meta.details, "Creator", info.Creator as string);
        push(meta.details, "Producer", info.Producer as string);
        push(meta.details, "Created", formatDate(pdfDate(info.CreationDate)));
        push(meta.details, "Modified", formatDate(pdfDate(info.ModDate)));
        push(meta.details, "PDF version", info.PDFFormatVersion as string);
        push(meta.details, "Page size", `${(vp.width / 72 * 25.4).toFixed(0)} × ${(vp.height / 72 * 25.4).toFixed(0)} mm`);
        if (info.IsAcroFormPresent) push(meta.details, "Form fields", "Yes");
        const text = await page.getTextContent();
        if (text.items.length === 0) meta.warnings.push("The first page has no selectable text — this may be a scanned document. Use OCR to extract text.");
      } finally {
        await closePdf(doc);
      }
    } else if (format.family === "image") {
      if (format.kind === "jpeg") {
        const exif = readExif(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()));
        if (exif) {
          push(meta.details, "Camera", [exif.make, exif.model].filter(Boolean).join(" "));
          push(meta.details, "Taken", exif.dateTime);
          push(meta.details, "Software", exif.software);
          push(meta.details, "Orientation", exif.orientation && exif.orientation !== 1 ? `Rotated (EXIF ${exif.orientation})` : undefined);
          if (exif.hasGps) meta.warnings.push("This photo contains GPS location data. Use “Remove Image Metadata” before sharing it.");
        }
      }
      try {
        const bmp = await createImageBitmap(file);
        meta.width = bmp.width;
        meta.height = bmp.height;
        push(meta.details, "Megapixels", ((bmp.width * bmp.height) / 1e6).toFixed(1));
        bmp.close();
      } catch {
        meta.warnings.push("Your browser can't decode this image format for preview.");
      }
    } else if (["docx", "xlsx", "pptx"].includes(format.kind)) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const core = await zip.file("docProps/core.xml")?.async("string");
      const app = await zip.file("docProps/app.xml")?.async("string");
      const tag = (xml: string | undefined, name: string) => xml?.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`))?.[1];
      push(meta.details, "Title", tag(core, "title"));
      push(meta.details, "Author", tag(core, "creator"));
      push(meta.details, "Last modified by", tag(core, "lastModifiedBy"));
      push(meta.details, "Created", formatDate(tag(core, "created") ? new Date(tag(core, "created")!) : null));
      push(meta.details, "Modified", formatDate(tag(core, "modified") ? new Date(tag(core, "modified")!) : null));
      push(meta.details, "Application", tag(app, "Application"));
      const pages = tag(app, "Pages") ?? tag(app, "Slides");
      if (pages) meta.pageCount = Number(pages);
      push(meta.details, "Words", tag(app, "Words"));
      if (format.kind === "xlsx") {
        const wb = await zip.file("xl/workbook.xml")?.async("string");
        push(meta.details, "Sheets", wb ? (wb.match(/<(?:\w+:)?sheet\s/g) ?? []).length : undefined);
      }
      if (Object.keys(zip.files).some((n) => /vbaProject\.bin$/i.test(n))) meta.warnings.push("This document contains macros.");
    } else if (format.family === "text") {
      const text = await file.slice(0, 5_000_000).text();
      push(meta.details, "Lines", text.split(/\r?\n/).length.toLocaleString());
      push(meta.details, "Characters", text.length.toLocaleString());
    } else if (format.kind === "zip") {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      push(meta.details, "Entries", Object.values(zip.files).filter((f) => !f.dir).length);
    }
  } catch {
    meta.warnings.push("Some details couldn't be read from this file.");
  }
  return meta;
}
