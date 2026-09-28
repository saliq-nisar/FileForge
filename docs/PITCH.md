# FileForge

### All your files. One powerful workspace.

**PDF, image, document, business and career tools in one private, fast web app. No accounts, no installs, and most tools never upload your files.**

---

## The problem

Teams and individuals juggle a dozen single-purpose websites every week: one to merge a PDF, another to compress it, another to convert an image, a spreadsheet to calculate an invoice, a word processor to format a resume. That setup has three problems:

- **Privacy risk.** Most online converters upload every file to someone else's server. Contracts, invoices, ID scans and resumes all end up on infrastructure you don't control.
- **Friction.** Ads, sign-up walls, daily limits and inconsistent interfaces slow people down.
- **Unreliable output.** Many tools quietly degrade quality, "compress" files that get bigger, or produce resumes that applicant tracking systems can't read.

## The solution

FileForge puts 100+ tools behind a single, consistent interface. You pick a task ("Compress a PDF"), drop a file, adjust a few sensible settings and download the result.

Most processing runs **inside the user's own browser**, so files never leave their device. Where a task genuinely needs a server, for example converting Word to PDF, the tool is clearly labelled and the files are deleted as soon as the result is delivered.

---

## What's included

### PDF tools

Merge, split, compress, rotate, rearrange pages visually, and delete, extract, duplicate or insert pages. Add watermarks (and remove removable ones), page numbers, headers and footers. Crop, resize to A4/Letter, edit metadata, flatten forms and fill in PDF forms. Convert PDF to JPG, PNG, WebP, text, HTML and Word (text-based), and images to PDF.

### Full PDF editor

A professional editing workspace with page thumbnails, a zoomable canvas and a properties panel. Users can add text, images, shapes, arrows, freehand drawing, highlights, underline and strikethrough, stamps and comments that open as real PDF sticky notes. It also covers signatures (drawn, typed or uploaded), page numbers and watermarks. It includes undo/redo and keyboard shortcuts, and works on touch devices with pinch zoom.

### OCR (text recognition)

Extract text from scanned PDFs and photos, then search, copy, or download it as TXT or Word, or save a **searchable PDF**. It runs entirely on the user's device.

### Image tools

Convert between JPG, PNG, WebP and AVIF. Compress to a quality level or a target file size, and see the before/after size clearly. Resize, crop, rotate, flip, blur, sharpen, grayscale, and add a watermark, text, border or background. Remove hidden photo metadata, including GPS location. Everything runs in batch, with "Download all as ZIP".

### Documents and compression

Word to text or HTML, Excel to CSV, CSV to Excel, compression for Word/Excel/PowerPoint files and ZIP archives, and one-click "compress any file". When a format can't be compressed, the app explains why instead of pretending it worked.

### Business documents

- **Invoices, quotes, receipts and purchase orders** built in 6 guided steps, with a live preview.
- Automatic totals with multiple taxes (GST, VAT, sales tax or any custom tax), tax-inclusive or tax-exclusive pricing, discounts, shipping and partial payments.
- 7 professional templates, your logo and colors, and automatic numbering that prevents duplicates.
- Status tracking (draft, sent, paid, partially paid, overdue, cancelled) with a searchable history.
- Business letter, offer letter, experience certificate, proposal and salary slip templates.
- Export to **PDF, Word or print**.

### Career tools

- **Resume builder** with 6 templates designed to be read correctly by applicant tracking systems (ATS), plus a "resume in 5 minutes" quick mode.
- **ATS checker.** Upload a PDF or Word resume, paste a job description, and get an estimated compatibility score. The breakdown is transparent (structure, formatting, keywords, skills, job title, readability), with specific fixes.
- **"Create a resume for a job".** Paste the posting, see which requirements are already covered, and generate a clean ATS-friendly version.
- **Bullet analyzer**, **cover letter builder**, and **side-by-side comparison** of resume versions.

---

## Why FileForge is different

| | Typical online tools | FileForge |
| --- | --- | --- |
| Where files go | Uploaded to a third-party server | Processed on the user's device for most tools |
| Accounts | Often required | Never required |
| Honest results | "Compressed" files can grow | If a file can't get smaller, you get the original back and are told why |
| Resume advice | Often AI that invents skills | Deterministic analysis that never adds skills or achievements for you |
| Unsupported tasks | Poor-quality output | Clearly marked as unavailable |
| Dependencies | External AI, cloud storage, CDNs | Works with **zero configuration**; no AI key, database or third-party service needed |

### Privacy by design

- There are no analytics, tracking cookies or user accounts.
- Browser-based tools never upload files.
- Server tools delete uploaded and processed files immediately after delivery, and automatically after a short retention window otherwise.
- A plain-language privacy page explains exactly what happens to files.

### No AI dependency

Every feature, including resume analysis and cover letters, works without any AI service. That means predictable results, no per-use AI costs, and no risk of the system inventing experience on someone's resume. AI can be added later as an optional, clearly labelled enhancement.

### Built for real use

- **Works everywhere.** It's responsive from 320px phones to large monitors, with mobile-specific navigation and touch-friendly editing. It supports light and dark mode.
- **Accessible.** Full keyboard navigation, screen-reader-friendly controls, visible focus states, and respect for reduced-motion settings.
- **Secure.** Files are validated by their actual content, not their name. File names are sanitized, strict browser security headers are in place, and user-facing errors never expose internal details.
- **Fast.** Heavy engines load only on the pages that need them, and processing runs in background threads so the interface stays responsive.
- **Search-friendly.** Every tool has its own indexable page with metadata, a sitemap and structured data.

---

## Quality and reliability

The product ships with an automated test suite that currently passes in full:

- **95 unit and integration tests.** They cover file validation, invoice arithmetic, the ATS scoring engine, PDF processing, document generation, the server API and user-interface flows.
- **27 end-to-end browser tests.** They cover real uploads, merging, compression, image conversion, batch processing, OCR, invoice creation, the PDF editor, and layouts at 320px to 1920px on desktop and mobile.
- Strict TypeScript and linting with zero errors, and a clean production build.

---

## Built to grow

New tools are added through a central registry: navigation, search, SEO pages and the sitemap update automatically. The architecture is ready for:

- Accounts and cloud sync for invoices, resumes and workspace history
- Server engines for higher-fidelity Office conversion, PDF/A archiving and password protection (already integrated, activated by configuration)
- Future tools such as redaction, PDF comparison, table extraction, background removal, HTML/Markdown to PDF, QR codes and checksums
- Optional AI enhancements (wording suggestions based only on the user's own facts)
- White-labelling: name, colors and branding are centralized design tokens

---

## Deployment options

| Option | What you get | Typical cost |
| --- | --- | --- |
| **Vercel (or similar)** | All browser-based tools, global CDN, HTTPS, automatic deploys | Free tier for evaluation; a paid plan for commercial use |
| **Own server / Docker** | Everything, plus server conversions (Word/Excel/PowerPoint → PDF, PDF/A, password protection) | Small VPS or cloud VM |

No database is required to launch.

---

## Current limitations (stated upfront)

- Existing text inside a PDF can't be edited in place reliably. The editor offers "whiteout and retype" instead.
- PDF → Word keeps text and paragraphs, not the exact layout.
- PDF → Excel is not offered yet, because table extraction needs a dedicated engine.
- AVIF image output depends on the user's browser.
- ATS scores are **estimates, not guarantees**. Real applicant tracking systems vary by employer.

---

## Next steps

1. **Live demo** — walk through the tools with your own sample files.
2. **Scope** — agree on branding, which modules to launch with, and whether server conversions are needed.
3. **Launch** — deploy to your domain, typically within days for the browser-based edition.

| | |
| --- | --- |
| Launch edition | *[your price / scope]* |
| Branding & customization | *[your price / scope]* |
| Hosting & maintenance | *[your price / scope]* |
| Contact | *[your name · email · phone]* |
