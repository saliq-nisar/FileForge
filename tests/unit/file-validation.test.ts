import { describe, expect, it } from "vitest";
import { detectFormat, looksLikeText, sniffKind } from "@/lib/file/detect";
import { acceptAttribute, describeKinds, formatOf, getExtension } from "@/lib/file/formats";
import { contentDisposition, deriveFileName, sanitizeFileName, uniqueNames } from "@/lib/file/names";
import { compareSizes, formatBytes } from "@/lib/file/size";
import { extensionMatches, validateDetectedFile, validateSelectionCount } from "@/lib/validation/files";
import { PNG_1x1, fileFrom, makeOfficeZip, makePdf } from "../helpers";

describe("format detection (magic bytes, never the file name)", () => {
  it("detects PDF, PNG, JPEG, WebP, GIF, TIFF and AVIF signatures", () => {
    const b = (s: string | number[]) => (typeof s === "string" ? new TextEncoder().encode(s) : Uint8Array.from(s));
    expect(sniffKind(b("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffKind(PNG_1x1)).toBe("png");
    expect(sniffKind(b([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffKind(b("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffKind(b("GIF89a"))).toBe("gif");
    expect(sniffKind(b([0x49, 0x49, 0x2a, 0x00]))).toBe("tiff");
    expect(sniffKind(b("\0\0\0\x1cftypavif"))).toBe("avif");
    expect(sniffKind(b("hello"))).toBeUndefined();
  });

  it("ignores a misleading extension and declared MIME type", async () => {
    const pdf = await makePdf(1);
    const f = await detectFormat(fileFrom(pdf, "photo.jpg", "image/jpeg"));
    expect(f.kind).toBe("pdf");
  });

  it("distinguishes DOCX, XLSX, PPTX and plain ZIP by package contents", async () => {
    for (const kind of ["docx", "xlsx", "pptx"] as const) {
      expect((await detectFormat(fileFrom(await makeOfficeZip(kind), `x.${kind}`))).kind).toBe(kind);
    }
  });

  it("recognizes text and CSV, rejects binary junk", async () => {
    expect((await detectFormat(fileFrom("a,b\n1,2\n", "data.csv"))).kind).toBe("csv");
    expect((await detectFormat(fileFrom("hello world", "notes.txt"))).kind).toBe("text");
    expect((await detectFormat(fileFrom(Uint8Array.from([0, 1, 2, 0, 255, 254]), "x.bin"))).kind).toBe("unknown");
    expect(looksLikeText(new TextEncoder().encode("plain text"))).toBe(true);
  });
});

describe("validation", () => {
  it("rejects unsupported, empty and oversized files", () => {
    const pdf = formatOf("pdf");
    expect(validateDetectedFile({ name: "a.pdf", size: 0 }, pdf, { accept: ["pdf"] }).error).toMatch(/empty/);
    expect(validateDetectedFile({ name: "a.png", size: 10 }, formatOf("png"), { accept: ["pdf"] }).error).toBe("This file format isn't supported.");
    expect(validateDetectedFile({ name: "a.pdf", size: 10_000 }, pdf, { accept: ["pdf"], maxBytes: 1000 }).error).toMatch(/exceeds the maximum/);
    expect(validateDetectedFile({ name: "a.pdf", size: 10_000 }, pdf, { accept: ["pdf"] })).toEqual({});
  });

  it("rejects extensions that contradict the content, tolerates image variants", () => {
    expect(extensionMatches("invoice.exe", formatOf("pdf"))).toBe(false);
    expect(extensionMatches("doc.pdf", formatOf("png"))).toBe(false);
    expect(extensionMatches("photo.jpg", formatOf("png"))).toBe(true);
    expect(extensionMatches("noextension", formatOf("pdf"))).toBe(true);
    expect(extensionMatches("data.json", formatOf("text"))).toBe(true);
  });

  it("limits the number of selected files", () => {
    expect(validateSelectionCount(0, 1, 1)).toBeUndefined();
    expect(validateSelectionCount(1, 1, 1)).toMatch(/one file/);
    expect(validateSelectionCount(48, 3, 50)).toMatch(/up to 50/);
  });
});

describe("file names", () => {
  it("strips paths, control characters, bidi overrides and reserved names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(sanitizeFileName("a\u0000b<c>.pdf")).toBe("abc.pdf");
    expect(sanitizeFileName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(sanitizeFileName("CON.txt")).toBe("_CON.txt");
    expect(sanitizeFileName("...")).toBe("file");
    expect(sanitizeFileName(`${"x".repeat(300)}.pdf`).length).toBeLessThanOrEqual(124);
  });

  it("derives output names and keeps ZIP entries unique", () => {
    expect(deriveFileName("My Report.pdf", "compressed", "pdf")).toBe("My Report-compressed.pdf");
    expect(uniqueNames(["a.pdf", "A.pdf", "a.pdf"])).toEqual(["a.pdf", "A (2).pdf", "a (3).pdf"]);
  });

  it("builds safe Content-Disposition headers", () => {
    const h = contentDisposition('résumé "final".pdf');
    expect(h).toContain("attachment;");
    expect(h).toContain("filename*=UTF-8''");
    expect(h).not.toMatch(/filename="[^"]*"[^;]*"/);
  });
});

describe("sizes and formats", () => {
  it("formats bytes and computes reductions", () => {
    expect(formatBytes(4_800_000)).toBe("4.8 MB");
    expect(formatBytes(999)).toBe("999 B");
    expect(compareSizes(4_800_000, 1_200_000)).toMatchObject({ saved: 3_600_000, reductionPercent: 75 });
    expect(compareSizes(100, 150).reductionPercent).toBe(-50);
  });

  it("builds accept attributes and labels", () => {
    expect(acceptAttribute(["pdf"])).toContain(".pdf");
    expect(describeKinds(["jpeg", "png", "webp"])).toBe("JPG, PNG or WebP");
    expect(getExtension("archive.tar.GZ")).toBe("gz");
  });
});
