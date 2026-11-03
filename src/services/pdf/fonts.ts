import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";

export type FontFamily = "sans" | "serif" | "mono";

const STANDARD: Record<FontFamily, { regular: StandardFonts; bold: StandardFonts; italic: StandardFonts }> = {
  sans: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique },
  serif: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic },
  mono: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique },
};

/** Liberation Sans ships with PDF.js (copied to /vendor) — metric-compatible with Arial, wide Unicode coverage. */
const UNICODE_FONT_FILES = {
  regular: "LiberationSans-Regular.ttf",
  bold: "LiberationSans-Bold.ttf",
  italic: "LiberationSans-Italic.ttf",
} as const;

type Weight = keyof typeof UNICODE_FONT_FILES;
const SYMBOL_FONT_FILE = "Geist-Regular.ttf";

const fontBytesCache = new Map<string, Promise<ArrayBuffer>>();

type FontBytesLoader = (file: string) => Promise<ArrayBuffer>;

let loader: FontBytesLoader = async (file) => {
  const origin = typeof location !== "undefined" ? location.origin : "";
  const res = await fetch(`${origin}/vendor/pdfjs/standard_fonts/${file}`);
  if (!res.ok) throw new Error("font unavailable");
  return res.arrayBuffer();
};

/** The server registers a filesystem loader; browsers fetch from /vendor. */
export function setFontBytesLoader(fn: FontBytesLoader): void {
  loader = fn;
  fontBytesCache.clear();
}

async function loadUnicodeFontBytes(file: string): Promise<ArrayBuffer> {
  let p = fontBytesCache.get(file);
  if (!p) {
    p = loader(file);
    fontBytesCache.set(file, p);
    p.catch(() => fontBytesCache.delete(file));
  }
  return p;
}

export class FontSet {
  private cache = new Map<string, PDFFont>();
  constructor(private doc: PDFDocument, private family: FontFamily = "sans") {}

  async get(weight: Weight = "regular"): Promise<PDFFont> {
    const key = `std-${this.family}-${weight}`;
    let font = this.cache.get(key);
    if (!font) {
      font = await this.doc.embedFont(STANDARD[this.family][weight]);
      this.cache.set(key, font);
    }
    return font;
  }

  /** Font able to render `text`: the standard font, Unicode font, or symbol fallback. */
  async forText(text: string, weight: Weight = "regular"): Promise<PDFFont> {
    const std = await this.get(weight);
    if (canEncode(std, text)) return std;
    const unicode = await this.unicode(weight);
    if (canEncode(unicode, text)) return unicode;
    const symbols = await this.symbols();
    if (canEncode(symbols, text)) return symbols;
    throw new Error("No bundled PDF font supports this text.");
  }

  async unicode(weight: Weight = "regular"): Promise<PDFFont> {
    const key = `uni-${weight}`;
    let font = this.cache.get(key);
    if (!font) {
      this.doc.registerFontkit(fontkit);
      font = await this.doc.embedFont(await loadUnicodeFontBytes(UNICODE_FONT_FILES[weight]), { subset: true });
      this.cache.set(key, font);
    }
    return font;
  }

  async symbols(): Promise<PDFFont> {
    const key = "symbols";
    let font = this.cache.get(key);
    if (!font) {
      this.doc.registerFontkit(fontkit);
      font = await this.doc.embedFont(await loadUnicodeFontBytes(SYMBOL_FONT_FILE), { subset: true });
      this.cache.set(key, font);
    }
    return font;
  }
}

const charsetCache = new WeakMap<PDFFont, Set<number>>();

export function canEncode(font: PDFFont, text: string): boolean {
  let set = charsetCache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsetCache.set(font, set);
  }
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 10 || cp === 13) continue;
    if (!set.has(cp)) return false;
  }
  return true;
}

/** Replace characters the font can't draw with "?" so drawing never throws. */
export function safeText(font: PDFFont, text: string): string {
  let set = charsetCache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsetCache.set(font, set);
  }
  let out = "";
  for (const ch of text.replace(/\t/g, "    ")) {
    const cp = ch.codePointAt(0)!;
    out += set.has(cp) ? ch : cp === 0x2011 || cp === 0x2010 ? "-" : cp === 0xa0 ? " " : "?";
  }
  return out;
}
