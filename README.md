# FileForge

**Everything you need to work with PDFs, images and documents** — plus invoices, business letters, ATS-friendly resumes and cover letters. Built with Next.js 16 (App Router), React 19, TypeScript (strict) and Tailwind CSS 4.

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables, database, AI key or external service is required. Everything below is optional.

---

## Where processing happens

| Area | Runs in | Engine |
| --- | --- | --- |
| Merge, split, rotate, organize, delete/extract/duplicate/insert pages, watermark (+ removal), page numbers, header/footer, crop, resize, metadata, flatten, form filling | Browser (Web Worker) | pdf-lib |
| PDF → JPG/PNG/WebP, PDF → text/HTML/Word (text), PDF compression | Browser (main thread) | PDF.js + pdf-lib + Canvas |
| Image convert/compress/resize/crop/rotate/flip/filters/watermark/text/border/background/metadata removal | Browser (Web Worker, OffscreenCanvas) | Canvas |
| OCR (images, scanned PDFs, searchable PDF) | Browser (WASM) | Tesseract.js, English model self-hosted |
| DOCX → text/HTML, XLSX ↔ CSV, Office file compression, ZIP | Browser | mammoth, JSZip, own XLSX reader/writer |
| Invoices, quotes, receipts, POs, letters, resumes, cover letters, ATS analysis | Browser | Own layout engine → PDF (real text) / DOCX / TXT |
| Word/Excel/PowerPoint → PDF, PDF → PowerPoint | **Server** (optional) | LibreOffice (`LIBREOFFICE_PATH`) |
| PDF → PDF/A | **Server** (optional) | Ghostscript (`GHOSTSCRIPT_PATH`) |
| Protect / unlock PDF (AES-256) | **Server** (optional) | qpdf (`QPDF_PATH`) |
| PDF → Excel | Not available | Needs a table-extraction engine; the tool says so instead of guessing |

Server tools are labeled “Server” in the UI and show a clear notice when their engine isn't configured. PDF.js worker, fonts, WASM decoders and the Tesseract engine + language model are copied from `node_modules` to `public/vendor` (`scripts/copy-vendor-assets.mjs`, runs on install/dev/build), so the app never contacts third-party CDNs.

## Architecture

```
src/
  app/                 routes (tools/[slug], business/*, career/*, workspace, settings, api/*), sitemap, robots
  components/          design system (ui/), layout shell, files (dropzone, previews, info), tools (runner, panels), documents (preview)
  features/            editor (PDF editor), pdf (organizer, form filler), ocr, business, career, workspace, settings
  services/            processing engines: pdf/, image/, document/, compression/, ocr/, documents/ (model + renderers),
                       processors/registry.ts, runner.ts (worker/main/server routing), storage/
  lib/                 tools registry + search, file detection/validation, ats engine, api contracts, errors, seo
  server/              server-only: config, logger, temp storage, job store, security hooks, engines, services, optional AI interface
  templates/           invoices/, resumes/, letters/ — content → document model
  stores/              zustand: settings, UI, workspace, toasts (UI state separate from processing state)
  workers/             processing.worker.ts
```

- **Tool registry** (`src/lib/tools/registry.ts`) drives navigation, search, dashboard, tool pages, SEO metadata and the sitemap. Options are declared as a schema and rendered generically; adding a tool is an entry + (if new) a processor.
- **Processors** share one signature `(inputs, options, ctx) => ProcessResult`. `runTool()` decides whether to run in a Web Worker, on the main thread or as a server job — UI components never import processing code directly.
- **Document model** (`services/documents/model.ts`): templates produce a format-independent model; renderers produce the live HTML preview, PDF (selectable text, embedded Unicode font, pagination, repeating table headers), DOCX and TXT.
- **ATS engine** (`src/lib/ats`): deterministic keyword/skill extraction, section/contact detection, bullet analysis and a documented scoring model (Structure 20 · Formatting 20 · Keywords 25 · Skills 20 · Job title 10 · Readability 5; JD-only categories are excluded, not zeroed, when no job description is given). Suggestions never add skills, metrics or experience on the user's behalf.
- **AI** is an optional interface (`src/server/ai/provider.ts`) with no adapters wired; no feature depends on it.

## API (server jobs)

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/files/upload` | Raw-body streaming upload (`x-file-name` header), size-limited, content-detected |
| POST | `/api/files/process` | `{ toolSlug, fileIds, options }` → `{ jobId }` (202) |
| GET | `/api/jobs/:id` | Job status/progress/result |
| GET | `/api/files/:id/download` | Attachment download (`nosniff`, sandboxed) |
| DELETE | `/api/files/:id` | Delete a temporary file |
| GET | `/api/health`, `/api/capabilities` | Health check; which optional engines are enabled |

Contracts are typed in `src/lib/api/contracts.ts`. Route handlers only translate HTTP ↔ services (`src/server/services`).

## Security

- Files are identified by magic bytes (and OOXML package contents), never by name, declared MIME type or client size; mismatching extensions are rejected; file names are sanitized (paths, control and bidi characters, reserved names).
- Server: streamed uploads with a hard byte limit, UUID-only file ids (no path traversal), per-owner authorization, in-memory rate limiting, 0600/0700 temp files with TTL cleanup, engines run with `execFile` (no shell), timeouts, private work directories, passwords passed to qpdf via an argument file, Ghostscript in `-dSAFER`.
- Integration points for real authentication, a shared rate-limit store and malware scanning are in `src/server/security`.
- Errors are mapped to a fixed set of user messages; stack traces, paths and library messages never reach clients.
- Strict CSP (no third-party origins), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Office previews render in a script-less sandboxed iframe.
- Secrets are server-only (`server-only` imports); the only public variable is `NEXT_PUBLIC_SITE_URL`.

## Configuration (all optional)

See `.env.example`: `NEXT_PUBLIC_SITE_URL`, `LIBREOFFICE_PATH`, `QPDF_PATH`, `GHOSTSCRIPT_PATH`, `MAX_UPLOAD_MB` (default 200), `TEMP_FILE_TTL_MINUTES` (default 60), `AI_PROVIDER`/`AI_API_KEY` (unused by core features).

## Privacy & data

No accounts, analytics or cookies. Settings, the workspace list (and result files only if enabled), remembered business details (opt-in) and saved invoices/resumes live in this browser's storage and can be deleted in Settings. Resume drafts live in `sessionStorage` (this tab only). Server tools delete uploads and results as soon as the browser has the result, and otherwise after the TTL.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` (strict) |
| `npm test` | Vitest unit + integration tests (file validation, registry/search, invoice math, ATS engine, spreadsheet I/O, PDF processors, document rendering, API flow, UI flows) |
| `npm run test:e2e` | Playwright against the production build (`npm run build` first); installs: `npx playwright install chromium` |
| `npm run check` | lint + typecheck + tests + build |

## Production notes

- The default job store and temp storage are single-instance (`next start` on one server). For multiple instances or serverless, replace `JobStore`/`StorageProvider` with shared implementations (Redis/DB + object storage) — interfaces are in `src/server`.
- Upload size is bounded by `MAX_UPLOAD_MB`; browser tools have per-family limits in `src/lib/constants/limits.ts`.
- `GET /api/health` is suitable for load-balancer checks.

## Known limitations (honest list)

- Existing PDF text can't be edited in place reliably; the editor offers whiteout + new text instead.
- PDF → Word keeps text and paragraphs only (layout, images and tables aren't reproduced).
- AVIF encoding depends on the browser; the tool reports when it isn't available. TIFF previews only work in Safari (OCR accepts TIFF).
- Image watermark placement is text-only; PDF watermarks are removable only when stored as watermark annotations or `/Artifact /Watermark` marked content.
- PDF/A output is produced by Ghostscript and should be validated (e.g. veraPDF) where certified compliance matters.
- ATS scores are estimates, not guarantees.
