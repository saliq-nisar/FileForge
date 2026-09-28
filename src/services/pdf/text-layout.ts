import type { PDFFont } from "pdf-lib";

/** Greedy word wrap using real font metrics. Honors explicit newlines; breaks overlong words. */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  const width = (s: string) => font.widthOfTextAtSize(s, size);
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (paragraph === "") {
      out.push("");
      continue;
    }
    const words = paragraph.split(/(\s+)/).filter((w) => w.length);
    let line = "";
    for (const token of words) {
      const candidate = line + token;
      if (width(candidate.trimEnd()) <= maxWidth || line.trim() === "") {
        if (width(candidate.trimEnd()) > maxWidth && line.trim() === "") {
          // Single word longer than the line: hard-break it.
          let chunk = "";
          for (const ch of token) {
            if (width(chunk + ch) > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        out.push(line.trimEnd());
        line = /^\s+$/.test(token) ? "" : token;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
