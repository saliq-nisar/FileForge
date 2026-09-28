import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/tools/categories";
import { TOOLS, defaultOptions, getTool, pageTools, popularTools, toolsInCategory } from "@/lib/tools/registry";
import { searchTools } from "@/lib/tools/search";
import { sanitizeOptions } from "@/lib/validation/options";
import { parsePageRanges, parsePageSelection } from "@/lib/validation/pages";
import { BROWSER_PROCESSORS } from "@/services/processors/registry";

describe("tool registry", () => {
  it("has unique slugs and valid categories", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) {
      expect(cats.has(t.category), t.slug).toBe(true);
      for (const c of t.alsoIn ?? []) expect(cats.has(c), `${t.slug} alsoIn ${c}`).toBe(true);
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("wires every processor tool to a real implementation (or server engine)", () => {
    for (const t of TOOLS.filter((x) => x.ui === "processor" && x.status !== "unavailable")) {
      expect(t.processor, t.slug).toBeTruthy();
      if (t.runtime === "browser") expect(BROWSER_PROCESSORS[t.processor!], t.slug).toBeDefined();
      else expect(t.engine, t.slug).toBeDefined();
    }
  });

  it("link tools point to app routes; page tools get /tools pages", () => {
    for (const t of TOOLS.filter((x) => x.ui === "link")) expect(t.href).toMatch(/^\//);
    expect(pageTools().every((t) => t.ui !== "link")).toBe(true);
  });

  it("marks unavailable tools with an explanation instead of faking them", () => {
    for (const t of TOOLS.filter((x) => x.status !== "available")) expect(t.note ?? t.engine, t.slug).toBeTruthy();
    expect(getTool("pdf-to-excel")?.status).toBe("unavailable");
  });

  it("exposes the popular tools and category listings", () => {
    expect(popularTools().map((t) => t.slug)).toEqual(["compress-pdf", "merge-pdf", "pdf-to-word", "jpg-to-pdf", "compress-image", "resize-image", "convert-image", "ocr"]);
    expect(toolsInCategory("compression").map((t) => t.slug)).toContain("compress-pdf");
  });

  it("applies presets over defaults", () => {
    expect(defaultOptions(getTool("jpg-to-png")!).format).toBe("png");
  });
});

describe("tool search", () => {
  it("finds compression tools for 'compress'", () => {
    const names = searchTools(TOOLS, "compress").map((t) => t.name);
    for (const n of ["Compress PDF", "Compress Image", "Compress JPG", "Compress PNG"]) expect(names).toContain(n);
  });

  it("ranks exact name matches first and handles jpeg/jpg synonyms", () => {
    expect(searchTools(TOOLS, "merge pdf")[0].slug).toBe("merge-pdf");
    expect(searchTools(TOOLS, "jpeg to pdf")[0].slug).toBe("jpg-to-pdf");
    expect(searchTools(TOOLS, "resume").some((t) => t.category === "career")).toBe(true);
    expect(searchTools(TOOLS, "zzzzqqq")).toEqual([]);
  });
});

describe("page ranges", () => {
  it("parses selections into zero-based unique indices", () => {
    expect(parsePageSelection("", 3)).toEqual([0, 1, 2]);
    expect(parsePageSelection("1-3, 5", 6)).toEqual([0, 1, 2, 4]);
    expect(parsePageSelection("4-", 6)).toEqual([3, 4, 5]);
    expect(parsePageSelection("2, 2, 1", 3)).toEqual([1, 0]);
  });

  it("rejects out-of-range or malformed input", () => {
    expect(parsePageSelection("0", 5)).toBeNull();
    expect(parsePageSelection("7", 5)).toBeNull();
    expect(parsePageSelection("3-1", 5)).toBeNull();
    expect(parsePageSelection("abc", 5)).toBeNull();
    expect(parsePageRanges("1-2, 3-4", 4)).toEqual([[0, 1], [2, 3]]);
  });
});

describe("option sanitization (never trust client options)", () => {
  const tool = getTool("compress-image")!;
  it("clamps numbers, rejects unknown choices and drops unknown keys", () => {
    const o = sanitizeOptions(tool, { quality: 500, format: "exe", maxSizeKb: "12", evil: "x" });
    expect(o.quality).toBe(100);
    expect(o.format).toBe("original");
    expect(o.maxSizeKb).toBe(12);
    expect("evil" in o).toBe(false);
  });

  it("validates colors and strips control characters from text", () => {
    const wm = getTool("watermark-pdf")!;
    const o = sanitizeOptions(wm, { color: "red;background:url(x)", text: "A\u0000B" });
    expect(o.color).toBe("#d93025");
    expect(o.text).toBe("AB");
  });

  it("presets always win", () => {
    expect(sanitizeOptions(getTool("png-to-jpg")!, { format: "avif" }).format).toBe("jpeg");
  });
});
