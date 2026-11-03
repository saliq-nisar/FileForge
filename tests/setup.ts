import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setFontBytesLoader } from "@/services/pdf/fonts";

// PDF generation embeds Liberation Sans; in tests read it from node_modules instead of HTTP.
setFontBytesLoader(async (file) => {
  const path = file === "Geist-Regular.ttf"
    ? join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og", file)
    : join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts", file);
  const buf = await readFile(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
});
