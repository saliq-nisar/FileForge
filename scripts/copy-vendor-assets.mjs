// Copies browser-side engine assets (PDF.js worker, Tesseract OCR core + English model)
// into public/vendor so they are served from our own origin. Nothing is fetched from
// third-party CDNs at runtime. Runs automatically on install, dev and build.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const out = join(root, "public", "vendor");

function copy(from, to, filter) {
  const src = join(nm, from);
  if (!existsSync(src)) {
    console.warn(`[vendor] missing ${from} — skipped`);
    return;
  }
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, filter });
}

copy("pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs");
copy("pdfjs-dist/cmaps", "pdfjs/cmaps");
copy("pdfjs-dist/standard_fonts", "pdfjs/standard_fonts");
copy("next/dist/compiled/@vercel/og/Geist-Regular.ttf", "pdfjs/standard_fonts/Geist-Regular.ttf");
copy("next/dist/compiled/@vercel/og/LICENSE", "pdfjs/standard_fonts/Geist-LICENSE");
copy("pdfjs-dist/wasm", "pdfjs/wasm");
copy("tesseract.js/dist/worker.min.js", "tesseract/worker.min.js");
copy("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "tesseract/lang/eng.traineddata.gz");

const coreDir = join(nm, "tesseract.js-core");
if (existsSync(coreDir)) {
  mkdirSync(join(out, "tesseract/core"), { recursive: true });
  for (const f of readdirSync(coreDir)) {
    if (/^tesseract-core.*lstm\.(js|wasm|wasm\.js)$/.test(f)) {
      cpSync(join(coreDir, f), join(out, "tesseract/core", f));
    }
  }
}
console.log("[vendor] assets ready in public/vendor");
