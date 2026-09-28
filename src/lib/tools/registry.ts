import type { FileKind } from "@/types/files";
import type { OptionField, ToolCategoryId, ToolDefinition } from "@/types/tools";
import { IMAGE_KINDS } from "@/lib/file/formats";

/*
 * Central tool registry. Navigation, search, the dashboard, tool pages, SEO
 * metadata and the sitemap are all generated from this list. Adding a tool =
 * adding an entry here (+ a processor if it needs a new operation).
 */

const PDF: FileKind[] = ["pdf"];
const RASTER_INPUT: FileKind[] = IMAGE_KINDS;
const EDITABLE_IMAGES: FileKind[] = ["jpeg", "png", "webp", "avif", "gif", "bmp"];

// ---------- reusable option fields ----------
const pagesField = (label = "Pages", help = "Leave empty for all pages. Example: 1-3, 5, 8-"): OptionField => ({
  type: "pages",
  key: "pages",
  label,
  default: "",
  placeholder: "All pages",
  help,
});

const qualityField = (def = 82): OptionField => ({
  type: "range",
  key: "quality",
  label: "Quality",
  default: def,
  min: 10,
  max: 100,
  step: 1,
  unit: "%",
});

const imageFormatChoices = [
  { value: "jpeg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF", hint: "Encoding depends on your browser" },
];

const positionChoices = [
  { value: "center", label: "Center" },
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

// ---------- helpers ----------
function pdfTool(t: Omit<ToolDefinition, "category" | "runtime" | "ui" | "status" | "accept"> & Partial<ToolDefinition>): ToolDefinition {
  return { category: "pdf", runtime: "browser", ui: "processor", status: "available", accept: PDF, ...t };
}

function imageTool(t: Omit<ToolDefinition, "category" | "runtime" | "ui" | "status" | "accept"> & Partial<ToolDefinition>): ToolDefinition {
  return {
    category: "image",
    runtime: "browser",
    ui: "processor",
    status: "available",
    accept: EDITABLE_IMAGES,
    multiple: true,
    maxFiles: 50,
    ...t,
  };
}

function editorTool(slug: string, name: string, description: string, editor: string, icon: string, keywords: string[]): ToolDefinition {
  return {
    slug,
    name,
    description,
    category: "editing",
    alsoIn: ["pdf"],
    keywords,
    icon,
    status: "available",
    ui: "editor",
    runtime: "browser",
    accept: PDF,
    editorTool: editor,
  };
}

function linkTool(category: ToolCategoryId, slug: string, name: string, description: string, href: string, icon: string, keywords: string[], popular = false): ToolDefinition {
  return { slug, name, description, category, keywords, icon, status: "available", ui: "link", runtime: "browser", accept: [], href, popular };
}

const LABEL: Record<string, string> = { jpeg: "JPG", png: "PNG", webp: "WebP", avif: "AVIF" };
const KIND: Record<string, FileKind> = { jpeg: "jpeg", png: "png", webp: "webp", avif: "avif" };

function conversion(from: string, to: string): ToolDefinition {
  const a = LABEL[from];
  const b = LABEL[to];
  return imageTool({
    slug: `${a.toLowerCase()}-to-${b.toLowerCase()}`,
    name: `${a} to ${b}`,
    description: `Convert ${a} images to ${b} in your browser.`,
    alsoIn: ["conversion"],
    keywords: ["convert", from, to, a, b, "image"],
    icon: "repeat",
    processor: "image-convert",
    accept: [KIND[from]],
    preset: { format: to },
    options: to === "png" ? [{ type: "toggle", key: "stripMetadata", label: "Remove metadata (EXIF, GPS)", default: true }] : [qualityField(to === "avif" ? 60 : 85)],
    resultLabel: `${b} image`,
  });
}

const IMAGE_CONVERSIONS: ToolDefinition[] = [
  ["jpeg", "png"], ["jpeg", "webp"], ["jpeg", "avif"],
  ["png", "jpeg"], ["png", "webp"], ["png", "avif"],
  ["webp", "jpeg"], ["webp", "png"], ["webp", "avif"],
  ["avif", "jpeg"], ["avif", "png"],
].map(([a, b]) => conversion(a, b));

function imageEdit(slug: string, name: string, description: string, operation: string, icon: string, keywords: string[], options: OptionField[] = [], extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return imageTool({
    slug,
    name,
    description,
    alsoIn: ["editing"],
    keywords: [...keywords, "image", "photo"],
    icon,
    processor: "image-edit",
    preset: { operation },
    options,
    ...extra,
  });
}

function pdfToImage(format: "jpeg" | "png" | "webp"): ToolDefinition {
  const label = LABEL[format];
  return pdfTool({
    slug: `pdf-to-${label.toLowerCase()}`,
    name: `PDF to ${label}`,
    description: `Turn each PDF page into a high-quality ${label} image.`,
    alsoIn: ["conversion"],
    keywords: ["convert", "export", "pages", "image", label],
    icon: "image",
    processor: "pdf-to-image",
    preset: { format },
    popular: format === "jpeg",
    options: [
      {
        type: "select",
        key: "dpi",
        label: "Resolution",
        default: "150",
        choices: [
          { value: "72", label: "72 DPI — screen" },
          { value: "150", label: "150 DPI — standard" },
          { value: "200", label: "200 DPI — sharp" },
          { value: "300", label: "300 DPI — print" },
        ],
      },
      ...(format === "png" ? [] : [qualityField(88)]),
      pagesField(),
    ],
    resultLabel: `${label} images`,
  });
}

function imagesToPdf(kind: "jpeg" | "png" | "webp" | "any"): ToolDefinition {
  const label = kind === "any" ? "Images" : LABEL[kind];
  return pdfTool({
    slug: kind === "any" ? "images-to-pdf" : `${label.toLowerCase()}-to-pdf`,
    name: `${label} to PDF`,
    description: kind === "any" ? "Combine photos and images into one PDF." : `Convert ${label} images into a PDF document.`,
    alsoIn: ["conversion"],
    keywords: ["convert", "photo", "image", "scan", label],
    icon: "file-image",
    processor: "images-to-pdf",
    accept: kind === "any" ? EDITABLE_IMAGES : [kind],
    multiple: true,
    maxFiles: 100,
    popular: kind === "jpeg",
    options: [
      {
        type: "select",
        key: "pageSize",
        label: "Page size",
        default: "fit",
        choices: [
          { value: "fit", label: "Same as image" },
          { value: "a4", label: "A4" },
          { value: "letter", label: "US Letter" },
        ],
      },
      {
        type: "segmented",
        key: "orientation",
        label: "Orientation",
        default: "auto",
        choices: [
          { value: "auto", label: "Auto" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ],
        showIf: { key: "pageSize", equals: ["a4", "letter"] },
      },
      {
        type: "segmented",
        key: "margin",
        label: "Margin",
        default: "small",
        choices: [
          { value: "none", label: "None" },
          { value: "small", label: "Small" },
          { value: "large", label: "Large" },
        ],
      },
    ],
    resultLabel: "PDF document",
  });
}

export const TOOLS: ToolDefinition[] = [
  // ============================== PDF ==============================
  pdfTool({
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine multiple PDFs into one document in the order you choose.",
    keywords: ["combine", "join", "append", "concatenate"],
    icon: "merge",
    processor: "pdf-merge",
    multiple: true,
    minFiles: 2,
    maxFiles: 50,
    popular: true,
    resultLabel: "Merged PDF",
  }),
  pdfTool({
    slug: "split-pdf",
    name: "Split PDF",
    description: "Split a PDF into several files by page ranges or fixed intervals.",
    keywords: ["separate", "divide", "break", "pages"],
    icon: "scissors",
    processor: "pdf-split",
    options: [
      {
        type: "segmented",
        key: "mode",
        label: "Split method",
        default: "ranges",
        choices: [
          { value: "ranges", label: "By ranges" },
          { value: "every", label: "Every N pages" },
          { value: "single", label: "Every page" },
        ],
      },
      { type: "pages", key: "ranges", label: "Page ranges", default: "", placeholder: "1-3, 4-6, 7-", help: "Each range becomes its own PDF.", showIf: { key: "mode", equals: ["ranges"] } },
      { type: "number", key: "every", label: "Pages per file", default: 2, min: 1, max: 1000, showIf: { key: "mode", equals: ["every"] } },
    ],
    resultLabel: "Split PDFs",
  }),
  pdfTool({
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce PDF file size while keeping text sharp and selectable.",
    seoDescription: "Compress PDF files quickly while maintaining quality. Runs in your browser.",
    alsoIn: ["compression"],
    keywords: ["reduce", "shrink", "optimize", "smaller", "size"],
    icon: "minimize",
    processor: "pdf-compress",
    popular: true,
    options: [
      {
        type: "segmented",
        key: "level",
        label: "Compression",
        default: "recommended",
        choices: [
          { value: "low", label: "Light", hint: "Lossless structure optimization" },
          { value: "recommended", label: "Recommended", hint: "Recompress images, keep text" },
          { value: "strong", label: "Strong", hint: "Smaller images, lower quality" },
        ],
      },
      {
        type: "toggle",
        key: "rasterize",
        label: "Convert pages to images",
        default: false,
        help: "Largest savings for scanned documents, but text will no longer be selectable or searchable.",
      },
    ],
    resultLabel: "Compressed PDF",
  }),
  pdfToImage("jpeg"),
  pdfToImage("png"),
  pdfToImage("webp"),
  imagesToPdf("jpeg"),
  imagesToPdf("png"),
  imagesToPdf("webp"),
  imagesToPdf("any"),
  pdfTool({
    slug: "pdf-to-word",
    name: "PDF to Word",
    description: "Extract the text of a PDF into an editable Word document.",
    alsoIn: ["conversion", "document"],
    keywords: ["docx", "word", "convert", "editable", "doc"],
    icon: "file-type",
    processor: "pdf-to-docx",
    popular: true,
    note: "Browser conversion keeps text and paragraphs; page layout, images and tables are not reproduced. For layout-faithful conversion, a server engine can be plugged into the conversion adapter.",
    resultLabel: "Word document",
  }),
  pdfTool({
    slug: "pdf-to-excel",
    name: "PDF to Excel",
    description: "Extract tables from PDFs into spreadsheets.",
    alsoIn: ["conversion"],
    keywords: ["xlsx", "spreadsheet", "table", "convert"],
    icon: "sheet",
    status: "unavailable",
    note: "Reliable table extraction needs a dedicated server engine, which isn't included yet. We won't produce a guessed spreadsheet. The conversion adapter interface is ready for one.",
  }),
  pdfTool({
    slug: "pdf-to-powerpoint",
    name: "PDF to PowerPoint",
    description: "Convert PDF pages into a PowerPoint presentation.",
    alsoIn: ["conversion"],
    keywords: ["pptx", "slides", "presentation", "convert"],
    icon: "presentation",
    status: "engine",
    runtime: "server",
    engine: "libreoffice",
    processor: "engine-pdf-to-pptx",
    resultLabel: "PowerPoint file",
  }),
  pdfTool({
    slug: "pdf-to-text",
    name: "PDF to Text",
    description: "Extract all text from a PDF as a plain text file.",
    alsoIn: ["conversion"],
    keywords: ["txt", "extract", "copy", "text"],
    icon: "text",
    processor: "pdf-to-text",
    options: [{ type: "toggle", key: "pageMarkers", label: "Add page separators", default: true }],
    note: "Scanned PDFs contain images, not text — use OCR for those.",
    resultLabel: "Text file",
  }),
  pdfTool({
    slug: "pdf-to-html",
    name: "PDF to HTML",
    description: "Convert PDF text into a clean, readable HTML page.",
    alsoIn: ["conversion"],
    keywords: ["web", "html", "convert"],
    icon: "code",
    processor: "pdf-to-html",
    note: "Text content is converted; images and exact positioning are not reproduced.",
    resultLabel: "HTML file",
  }),
  pdfTool({
    slug: "pdf-to-pdfa",
    name: "PDF to PDF/A",
    description: "Convert PDFs to PDF/A for long-term archiving.",
    alsoIn: ["conversion"],
    keywords: ["archive", "pdfa", "iso", "long-term"],
    icon: "archive",
    status: "engine",
    runtime: "server",
    engine: "ghostscript",
    processor: "engine-pdf-to-pdfa",
    note: "Produces PDF/A-2b using Ghostscript. Validate with a checker such as veraPDF if you need guaranteed compliance.",
    resultLabel: "PDF/A document",
  }),
  pdfTool({
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Rotate all or selected pages permanently.",
    keywords: ["turn", "orientation", "landscape", "portrait"],
    icon: "rotate-cw",
    processor: "pdf-rotate",
    multiple: true,
    maxFiles: 20,
    options: [
      {
        type: "segmented",
        key: "angle",
        label: "Rotation",
        default: "90",
        choices: [
          { value: "90", label: "90° right" },
          { value: "180", label: "180°" },
          { value: "270", label: "90° left" },
        ],
      },
      pagesField(),
    ],
    resultLabel: "Rotated PDF",
  }),
  pdfTool({
    slug: "organize-pdf",
    name: "Rearrange PDF pages",
    description: "Drag pages into a new order, rotate, duplicate, insert or delete them.",
    alsoIn: ["editing"],
    keywords: ["reorder", "sort", "organize", "move", "arrange", "rearrange"],
    icon: "layout-grid",
    ui: "organizer",
    popular: false,
    resultLabel: "Reorganized PDF",
  }),
  pdfTool({
    slug: "delete-pdf-pages",
    name: "Delete PDF pages",
    description: "Remove unwanted pages from a PDF.",
    keywords: ["remove", "pages", "cut"],
    icon: "trash",
    processor: "pdf-pages",
    preset: { mode: "delete" },
    options: [pagesField("Pages to delete", "Example: 2, 5-7")],
    resultLabel: "PDF",
  }),
  pdfTool({
    slug: "extract-pdf-pages",
    name: "Extract PDF pages",
    description: "Save selected pages as a new PDF.",
    keywords: ["pull", "select", "pages", "save"],
    icon: "file-output",
    processor: "pdf-pages",
    preset: { mode: "extract" },
    options: [
      pagesField("Pages to extract", "Example: 1, 3-5"),
      { type: "toggle", key: "separate", label: "Save each page as a separate PDF", default: false },
    ],
    resultLabel: "Extracted pages",
  }),
  pdfTool({
    slug: "duplicate-pdf-pages",
    name: "Duplicate PDF pages",
    description: "Repeat selected pages inside a PDF.",
    keywords: ["copy", "repeat", "pages", "clone"],
    icon: "copy",
    processor: "pdf-pages",
    preset: { mode: "duplicate" },
    options: [
      pagesField("Pages to duplicate", "Example: 1, 4"),
      { type: "number", key: "copies", label: "Copies of each page", default: 1, min: 1, max: 50 },
    ],
    resultLabel: "PDF",
  }),
  pdfTool({
    slug: "add-pdf-pages",
    name: "Add blank pages",
    description: "Insert blank pages at any position in a PDF.",
    keywords: ["insert", "blank", "pages", "add"],
    icon: "file-plus",
    processor: "pdf-pages",
    preset: { mode: "insert" },
    options: [
      { type: "number", key: "after", label: "Insert after page", default: 0, min: 0, max: 100000, help: "Use 0 to insert at the beginning." },
      { type: "number", key: "count", label: "Number of blank pages", default: 1, min: 1, max: 100 },
    ],
    note: "To insert pages from another PDF, use Merge PDF and then Rearrange pages.",
    resultLabel: "PDF",
  }),
  pdfTool({
    slug: "watermark-pdf",
    name: "Add watermark",
    description: "Stamp text over or behind your PDF pages.",
    alsoIn: ["editing"],
    keywords: ["stamp", "confidential", "draft", "brand", "watermark"],
    icon: "stamp",
    processor: "pdf-watermark",
    options: [
      { type: "text", key: "text", label: "Watermark text", default: "CONFIDENTIAL", maxLength: 120 },
      { type: "number", key: "fontSize", label: "Font size", default: 48, min: 6, max: 300, unit: "pt" },
      { type: "color", key: "color", label: "Color", default: "#d93025" },
      { type: "range", key: "opacity", label: "Opacity", default: 25, min: 5, max: 100, unit: "%" },
      { type: "number", key: "rotation", label: "Rotation", default: 45, min: -180, max: 180, unit: "°" },
      {
        type: "select",
        key: "layout",
        label: "Placement",
        default: "center",
        choices: [
          { value: "center", label: "Centered" },
          { value: "tiled", label: "Tiled across page" },
        ],
      },
      pagesField(),
    ],
    resultLabel: "Watermarked PDF",
  }),
  pdfTool({
    slug: "remove-watermark",
    name: "Remove watermark",
    description: "Remove watermarks that were added as removable watermark objects.",
    alsoIn: ["editing"],
    keywords: ["delete", "watermark", "clean"],
    icon: "eraser",
    processor: "pdf-remove-watermark",
    note: "Works for watermarks stored as watermark annotations or marked watermark content (added by Acrobat, FileForge and similar tools). Watermarks merged into page text or images cannot be separated — you'll be told if nothing removable was found.",
    resultLabel: "PDF",
  }),
  pdfTool({
    slug: "add-page-numbers",
    name: "Add page numbers",
    description: "Number your PDF pages with the position and style you want.",
    alsoIn: ["editing"],
    keywords: ["number", "pagination", "footer", "paginate"],
    icon: "list-ordered",
    processor: "pdf-page-numbers",
    options: [
      {
        type: "select",
        key: "position",
        label: "Position",
        default: "bottom-center",
        choices: positionChoices.filter((c) => c.value !== "center"),
      },
      {
        type: "select",
        key: "format",
        label: "Format",
        default: "{n}",
        choices: [
          { value: "{n}", label: "1" },
          { value: "Page {n}", label: "Page 1" },
          { value: "Page {n} of {total}", label: "Page 1 of 10" },
          { value: "{n} / {total}", label: "1 / 10" },
        ],
      },
      { type: "number", key: "start", label: "Start at", default: 1, min: 0, max: 100000 },
      { type: "number", key: "fontSize", label: "Font size", default: 10, min: 6, max: 48, unit: "pt" },
      { type: "toggle", key: "skipFirst", label: "Skip the first page", default: false },
    ],
    resultLabel: "Numbered PDF",
  }),
  pdfTool({
    slug: "pdf-header-footer",
    name: "Add header & footer",
    description: "Add header and footer text with page numbers, dates and file name.",
    alsoIn: ["editing"],
    keywords: ["header", "footer", "running", "text"],
    icon: "panel-top",
    processor: "pdf-header-footer",
    options: [
      { type: "text", key: "header", label: "Header", default: "", placeholder: "e.g. {filename}", maxLength: 200 },
      { type: "segmented", key: "headerAlign", label: "Header alignment", default: "center", choices: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }] },
      { type: "text", key: "footer", label: "Footer", default: "Page {page} of {total}", maxLength: 200 },
      { type: "segmented", key: "footerAlign", label: "Footer alignment", default: "center", choices: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }] },
      { type: "number", key: "fontSize", label: "Font size", default: 9, min: 6, max: 36, unit: "pt" },
      { type: "color", key: "color", label: "Color", default: "#444444" },
    ],
    note: "Placeholders: {page}, {total}, {date}, {filename}.",
    resultLabel: "PDF",
  }),
  pdfTool({
    slug: "crop-pdf",
    name: "Crop PDF",
    description: "Trim page margins by a fixed amount on each side.",
    alsoIn: ["editing"],
    keywords: ["trim", "margins", "cut", "crop"],
    icon: "crop",
    processor: "pdf-crop",
    options: [
      { type: "number", key: "top", label: "Top", default: 10, min: 0, max: 500, unit: "mm" },
      { type: "number", key: "right", label: "Right", default: 10, min: 0, max: 500, unit: "mm" },
      { type: "number", key: "bottom", label: "Bottom", default: 10, min: 0, max: 500, unit: "mm" },
      { type: "number", key: "left", label: "Left", default: 10, min: 0, max: 500, unit: "mm" },
      pagesField(),
    ],
    resultLabel: "Cropped PDF",
  }),
  pdfTool({
    slug: "resize-pdf",
    name: "Resize PDF pages",
    description: "Scale pages to A4, Letter or another standard size.",
    alsoIn: ["editing"],
    keywords: ["page size", "a4", "letter", "scale", "resize"],
    icon: "scaling",
    processor: "pdf-resize",
    options: [
      {
        type: "select",
        key: "size",
        label: "Page size",
        default: "a4",
        choices: [
          { value: "a4", label: "A4 (210 × 297 mm)" },
          { value: "letter", label: "US Letter (8.5 × 11 in)" },
          { value: "legal", label: "US Legal (8.5 × 14 in)" },
          { value: "a3", label: "A3 (297 × 420 mm)" },
          { value: "a5", label: "A5 (148 × 210 mm)" },
        ],
      },
      { type: "segmented", key: "orientation", label: "Orientation", default: "auto", choices: [{ value: "auto", label: "Match pages" }, { value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }] },
    ],
    note: "Content is scaled to fit and centered. Links and form fields on resized pages are not preserved.",
    resultLabel: "Resized PDF",
  }),
  pdfTool({
    slug: "pdf-metadata",
    name: "Change PDF metadata",
    description: "View and edit title, author, subject and keywords — or remove them.",
    alsoIn: ["security"],
    keywords: ["properties", "title", "author", "info", "metadata"],
    icon: "info",
    processor: "pdf-metadata",
    options: [
      { type: "toggle", key: "clear", label: "Remove all metadata", default: false },
      { type: "text", key: "title", label: "Title", default: "", maxLength: 300, showIf: { key: "clear", equals: [false] } },
      { type: "text", key: "author", label: "Author", default: "", maxLength: 300, showIf: { key: "clear", equals: [false] } },
      { type: "text", key: "subject", label: "Subject", default: "", maxLength: 300, showIf: { key: "clear", equals: [false] } },
      { type: "text", key: "keywords", label: "Keywords", default: "", placeholder: "comma separated", maxLength: 500, showIf: { key: "clear", equals: [false] } },
      { type: "text", key: "creator", label: "Creator", default: "", maxLength: 300, showIf: { key: "clear", equals: [false] } },
    ],
    resultLabel: "PDF",
  }),
  pdfTool({
    slug: "flatten-pdf",
    name: "Flatten PDF",
    description: "Make form fields permanent so they can no longer be edited.",
    alsoIn: ["security"],
    keywords: ["flatten", "forms", "lock", "fields"],
    icon: "layers",
    processor: "pdf-flatten",
    note: "Form fields are flattened into the page. Other annotations (comments, highlights) are kept as they are.",
    resultLabel: "Flattened PDF",
  }),
  pdfTool({
    slug: "protect-pdf",
    name: "Protect PDF",
    description: "Encrypt a PDF with a password (AES-256).",
    category: "security",
    alsoIn: ["pdf"],
    keywords: ["password", "encrypt", "secure", "lock"],
    icon: "lock",
    status: "engine",
    runtime: "server",
    engine: "qpdf",
    processor: "engine-pdf-protect",
    options: [
      { type: "text", key: "password", label: "Password", default: "", maxLength: 128, help: "Use at least 8 characters." },
      { type: "toggle", key: "allowPrint", label: "Allow printing", default: true },
      { type: "toggle", key: "allowCopy", label: "Allow copying text", default: false },
    ],
    resultLabel: "Protected PDF",
  }),
  pdfTool({
    slug: "unlock-pdf",
    name: "Unlock PDF",
    description: "Remove the password from a PDF you have the password for.",
    category: "security",
    alsoIn: ["pdf"],
    keywords: ["password", "decrypt", "remove", "unlock"],
    icon: "unlock",
    status: "engine",
    runtime: "server",
    engine: "qpdf",
    processor: "engine-pdf-unlock",
    options: [{ type: "text", key: "password", label: "Current password", default: "", maxLength: 128 }],
    note: "Only for PDFs you're authorized to open. The password is required — this tool does not crack passwords.",
    resultLabel: "Unlocked PDF",
  }),
  pdfTool({
    slug: "fill-pdf-forms",
    name: "Fill PDF forms",
    description: "Fill in interactive PDF form fields and save the result.",
    alsoIn: ["editing"],
    keywords: ["form", "fields", "fill", "acroform"],
    icon: "form-input",
    ui: "form-filler",
    resultLabel: "Filled PDF",
  }),
  {
    slug: "edit-pdf",
    name: "Edit PDF",
    description: "Add text, images, shapes, drawings, highlights, comments and signatures.",
    category: "editing",
    alsoIn: ["pdf"],
    keywords: ["editor", "annotate", "modify", "write", "change"],
    icon: "file-pen",
    status: "available",
    ui: "editor",
    runtime: "browser",
    accept: PDF,
    popular: false,
  },
  editorTool("sign-pdf", "Sign PDF", "Draw, type or upload your signature and place it on a PDF.", "signature", "signature", ["signature", "sign", "e-sign"]),
  editorTool("annotate-pdf", "Annotate PDF", "Comment, highlight, underline and mark up PDFs.", "comment", "message-square", ["annotate", "comment", "markup", "review"]),
  editorTool("highlight-pdf", "Highlight PDF", "Highlight important passages in a PDF.", "highlight", "highlighter", ["highlight", "marker"]),
  editorTool("draw-pdf", "Draw on PDF", "Draw freehand on PDF pages.", "draw", "pencil", ["draw", "sketch", "freehand", "pen"]),
  editorTool("add-text-to-pdf", "Add text to PDF", "Type new text anywhere on a PDF page.", "text", "type", ["text", "type", "write"]),
  editorTool("add-image-to-pdf", "Add image to PDF", "Place, move and resize images on PDF pages.", "image", "image-plus", ["image", "logo", "picture", "insert"]),
  editorTool("add-shapes-to-pdf", "Add shapes to PDF", "Add rectangles, circles, lines and arrows.", "shape", "shapes", ["shapes", "rectangle", "circle", "arrow", "line"]),

  // ============================== OCR ==============================
  {
    slug: "ocr",
    name: "OCR — Image & PDF to text",
    description: "Extract text from scans and photos, then search, copy or export it.",
    category: "ocr",
    alsoIn: ["pdf", "image"],
    keywords: ["ocr", "scan", "recognize", "extract text", "searchable", "tesseract"],
    icon: "scan-text",
    status: "available",
    ui: "ocr",
    runtime: "browser",
    accept: ["pdf", "jpeg", "png", "webp", "tiff", "bmp", "gif"],
    popular: true,
    note: "OCR runs entirely in your browser. English is included; recognition accuracy depends on scan quality.",
  },

  // ============================== Images ==============================
  imageTool({
    slug: "compress-image",
    name: "Compress Image",
    description: "Shrink JPG, PNG, WebP and AVIF images by quality or to a target size.",
    alsoIn: ["compression"],
    keywords: ["reduce", "optimize", "smaller", "size", "kb", "photo"],
    icon: "minimize",
    processor: "image-compress",
    popular: true,
    options: [
      qualityField(75),
      { type: "number", key: "maxSizeKb", label: "Maximum file size", default: 0, min: 0, max: 100000, unit: "KB", help: "0 = no target. Quality is lowered, then dimensions, until the image fits." },
      {
        type: "select",
        key: "format",
        label: "Output format",
        default: "original",
        choices: [{ value: "original", label: "Same as input" }, ...imageFormatChoices],
      },
      { type: "number", key: "maxWidth", label: "Max width", default: 0, min: 0, max: 20000, unit: "px", help: "0 = keep" },
      { type: "number", key: "maxHeight", label: "Max height", default: 0, min: 0, max: 20000, unit: "px", help: "0 = keep" },
    ],
    resultLabel: "Compressed images",
  }),
  ...(["jpeg", "png", "webp"] as const).map((k) =>
    imageTool({
      slug: `compress-${LABEL[k].toLowerCase()}`,
      name: `Compress ${LABEL[k]}`,
      description: `Reduce ${LABEL[k]} file size while keeping it looking good.`,
      alsoIn: ["compression"],
      keywords: ["reduce", "optimize", "smaller", LABEL[k]],
      icon: "minimize",
      processor: "image-compress",
      accept: [k],
      preset: { format: "original" },
      options: [
        qualityField(k === "png" ? 80 : 75),
        { type: "number", key: "maxSizeKb", label: "Maximum file size", default: 0, min: 0, max: 100000, unit: "KB", help: "0 = no target" },
      ],
      note: k === "png" ? "PNG is lossless. Lower quality settings reduce size by shrinking dimensions; for big savings convert to WebP." : undefined,
      resultLabel: "Compressed images",
    }),
  ),
  imageEdit("resize-image", "Resize Image", "Change image dimensions by pixels or percentage.", "resize", "scaling", ["resize", "dimensions", "scale", "width", "height"], [
    { type: "segmented", key: "resizeMode", label: "Resize by", default: "pixels", choices: [{ value: "pixels", label: "Pixels" }, { value: "percent", label: "Percentage" }] },
    { type: "number", key: "width", label: "Width", default: 1200, min: 1, max: 20000, unit: "px", showIf: { key: "resizeMode", equals: ["pixels"] } },
    { type: "number", key: "height", label: "Height", default: 0, min: 0, max: 20000, unit: "px", help: "0 = keep aspect ratio", showIf: { key: "resizeMode", equals: ["pixels"] } },
    { type: "range", key: "percent", label: "Scale", default: 50, min: 1, max: 400, unit: "%", showIf: { key: "resizeMode", equals: ["percent"] } },
  ], { popular: true }),
  {
    ...imageTool({
      slug: "convert-image",
      name: "Convert Image",
      description: "Convert between JPG, PNG, WebP and AVIF, with color options.",
      alsoIn: ["conversion"],
      keywords: ["convert", "format", "jpg", "png", "webp", "avif", "change"],
      icon: "repeat",
      processor: "image-convert",
      popular: true,
      options: [
        { type: "select", key: "format", label: "Convert to", default: "webp", choices: imageFormatChoices },
        { ...qualityField(85), showIf: { key: "format", equals: ["jpeg", "webp", "avif"] } },
        { type: "segmented", key: "color", label: "Color", default: "color", choices: [{ value: "color", label: "Full color" }, { value: "grayscale", label: "Grayscale" }] },
        { type: "color", key: "background", label: "Background for transparency", default: "#ffffff", showIf: { key: "format", equals: ["jpeg"] } },
      ],
      resultLabel: "Converted images",
    }),
    accept: RASTER_INPUT,
  },
  ...IMAGE_CONVERSIONS,
  imageEdit("crop-image", "Crop Image", "Trim edges from images by percentage.", "crop", "crop", ["crop", "trim", "cut"], [
    { type: "range", key: "top", label: "Top", default: 0, min: 0, max: 90, unit: "%" },
    { type: "range", key: "right", label: "Right", default: 0, min: 0, max: 90, unit: "%" },
    { type: "range", key: "bottom", label: "Bottom", default: 0, min: 0, max: 90, unit: "%" },
    { type: "range", key: "left", label: "Left", default: 0, min: 0, max: 90, unit: "%" },
  ]),
  imageEdit("rotate-image", "Rotate Image", "Rotate images by 90°, 180° or any angle.", "rotate", "rotate-cw", ["rotate", "turn", "orientation"], [
    { type: "number", key: "angle", label: "Angle (clockwise)", default: 90, min: -360, max: 360, unit: "°" },
    { type: "color", key: "background", label: "Background for corners", default: "#ffffff", help: "Used for angles that aren't multiples of 90°." },
  ]),
  imageEdit("flip-image", "Flip Image", "Mirror images horizontally or vertically.", "flip", "flip-horizontal", ["flip", "mirror"], [
    { type: "segmented", key: "direction", label: "Direction", default: "horizontal", choices: [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }, { value: "both", label: "Both" }] },
  ]),
  imageEdit("grayscale-image", "Grayscale Image", "Convert images to black and white.", "grayscale", "contrast", ["black and white", "grayscale", "monochrome"]),
  imageEdit("blur-image", "Blur Image", "Apply a smooth blur to images.", "blur", "droplet", ["blur", "soften"], [
    { type: "range", key: "radius", label: "Blur radius", default: 4, min: 1, max: 50, unit: "px" },
  ]),
  imageEdit("sharpen-image", "Sharpen Image", "Make soft images crisper.", "sharpen", "sparkles", ["sharpen", "crisp", "enhance"], [
    { type: "range", key: "amount", label: "Strength", default: 50, min: 5, max: 100, unit: "%" },
  ]),
  imageEdit("watermark-image", "Watermark Image", "Add a text watermark to images.", "watermark", "stamp", ["watermark", "copyright", "brand"], [
    { type: "text", key: "text", label: "Text", default: "© Your name", maxLength: 120 },
    { type: "select", key: "position", label: "Position", default: "bottom-right", choices: [...positionChoices, { value: "tiled", label: "Tiled" }] },
    { type: "range", key: "size", label: "Size", default: 5, min: 1, max: 30, unit: "%" },
    { type: "color", key: "color", label: "Color", default: "#ffffff" },
    { type: "range", key: "opacity", label: "Opacity", default: 60, min: 5, max: 100, unit: "%" },
  ]),
  imageEdit("add-text-to-image", "Add Text to Image", "Place a caption or label on images.", "text", "type", ["text", "caption", "label", "meme"], [
    { type: "text", key: "text", label: "Text", default: "Your text", maxLength: 300 },
    { type: "select", key: "position", label: "Position", default: "bottom-center", choices: positionChoices },
    { type: "range", key: "size", label: "Size", default: 6, min: 1, max: 30, unit: "%" },
    { type: "color", key: "color", label: "Text color", default: "#ffffff" },
    { type: "toggle", key: "box", label: "Background box", default: true },
    { type: "color", key: "boxColor", label: "Box color", default: "#000000", showIf: { key: "box", equals: [true] } },
  ]),
  imageEdit("add-border-to-image", "Add Border", "Frame images with a solid border.", "border", "square", ["border", "frame"], [
    { type: "number", key: "width", label: "Border width", default: 20, min: 1, max: 1000, unit: "px" },
    { type: "color", key: "color", label: "Color", default: "#ffffff" },
  ]),
  imageEdit("add-background-to-image", "Add Background", "Fill transparent areas and add padding.", "background", "paint-bucket", ["background", "transparent", "fill", "padding"], [
    { type: "color", key: "color", label: "Background color", default: "#ffffff" },
    { type: "number", key: "padding", label: "Padding", default: 0, min: 0, max: 2000, unit: "px" },
  ]),
  imageEdit("remove-image-metadata", "Remove Image Metadata", "Strip EXIF, GPS location and camera data from photos.", "strip", "eraser", ["exif", "gps", "privacy", "metadata", "location"], [], {
    category: "image",
    alsoIn: ["security"],
    note: "Images are re-encoded, which removes all embedded metadata. JPG and WebP are saved at 95% quality; PNG stays lossless.",
  }),

  // ============================== Documents ==============================
  docTool("docx-to-pdf", "Word to PDF", "Convert DOCX documents to PDF.", ["docx"], "engine-office-to-pdf", ["word", "docx", "convert", "pdf"], { status: "engine", runtime: "server", engine: "libreoffice", popular: false }),
  docTool("docx-to-text", "Word to Text", "Extract plain text from DOCX files.", ["docx"], "docx-to-text", ["word", "docx", "txt", "text"]),
  docTool("docx-to-html", "Word to HTML", "Convert DOCX documents to clean HTML.", ["docx"], "docx-to-html", ["word", "docx", "html", "web"]),
  docTool("xlsx-to-pdf", "Excel to PDF", "Convert XLSX spreadsheets to PDF.", ["xlsx"], "engine-office-to-pdf", ["excel", "xlsx", "pdf"], { status: "engine", runtime: "server", engine: "libreoffice" }),
  docTool("xlsx-to-csv", "Excel to CSV", "Export spreadsheet sheets as CSV files.", ["xlsx"], "xlsx-to-csv", ["excel", "xlsx", "csv", "spreadsheet"], {
    options: [{ type: "segmented", key: "sheets", label: "Sheets", default: "first", choices: [{ value: "first", label: "First sheet" }, { value: "all", label: "All sheets" }] }],
    note: "Cell values are exported (formulas as their last calculated values). Formatting is not part of CSV.",
  }),
  docTool("csv-to-xlsx", "CSV to Excel", "Turn CSV data into an Excel spreadsheet.", ["csv", "text"], "csv-to-xlsx", ["csv", "excel", "xlsx", "spreadsheet"], {
    options: [
      { type: "select", key: "delimiter", label: "Delimiter", default: "auto", choices: [{ value: "auto", label: "Detect automatically" }, { value: ",", label: "Comma" }, { value: ";", label: "Semicolon" }, { value: "\t", label: "Tab" }, { value: "|", label: "Pipe" }] },
      { type: "toggle", key: "convertNumbers", label: "Store numbers as numbers", default: true },
    ],
  }),
  docTool("pptx-to-pdf", "PowerPoint to PDF", "Convert PPTX presentations to PDF.", ["pptx"], "engine-office-to-pdf", ["powerpoint", "pptx", "slides", "pdf"], { status: "engine", runtime: "server", engine: "libreoffice" }),

  // ============================== Compression ==============================
  {
    slug: "compress-office",
    name: "Compress Office file",
    description: "Shrink DOCX, XLSX and PPTX files by recompressing their images and data.",
    category: "compression",
    alsoIn: ["document"],
    keywords: ["docx", "xlsx", "pptx", "word", "excel", "powerpoint", "reduce", "compress"],
    icon: "minimize",
    status: "available",
    ui: "processor",
    runtime: "browser",
    processor: "office-compress",
    accept: ["docx", "xlsx", "pptx"],
    multiple: true,
    maxFiles: 20,
    options: [
      { type: "segmented", key: "level", label: "Compression", default: "recommended", choices: [{ value: "low", label: "Lossless" }, { value: "recommended", label: "Recommended" }, { value: "strong", label: "Strong" }] },
    ],
    note: "Lossless repacks the file at maximum compression. Recommended and Strong also recompress embedded photos (JPEG). Text and structure are untouched.",
    resultLabel: "Compressed files",
  },
  {
    slug: "compress-zip",
    name: "Recompress ZIP",
    description: "Repack a ZIP archive at maximum compression.",
    category: "compression",
    keywords: ["zip", "archive", "repack", "compress"],
    icon: "file-archive",
    status: "available",
    ui: "processor",
    runtime: "browser",
    processor: "zip-recompress",
    accept: ["zip"],
    note: "Files already compressed inside the archive (photos, videos, PDFs) rarely get smaller. You'll see the honest result.",
    resultLabel: "ZIP archive",
  },
  {
    slug: "create-zip",
    name: "Create ZIP archive",
    description: "Bundle any files into one compressed ZIP archive.",
    category: "compression",
    keywords: ["zip", "archive", "bundle", "compress", "folder"],
    icon: "package",
    status: "available",
    ui: "processor",
    runtime: "browser",
    processor: "zip-create",
    accept: ["pdf", ...IMAGE_KINDS, "docx", "xlsx", "pptx", "zip", "text", "csv"],
    multiple: true,
    maxFiles: 100,
    resultLabel: "ZIP archive",
  },
  {
    slug: "compress-file",
    name: "Compress any file",
    description: "Drop a PDF, image, Office file or ZIP — we pick the right compressor.",
    category: "compression",
    keywords: ["compress", "reduce", "smaller", "size", "file"],
    icon: "minimize",
    status: "available",
    ui: "processor",
    runtime: "browser",
    processor: "auto-compress",
    accept: ["pdf", "jpeg", "png", "webp", "avif", "docx", "xlsx", "pptx", "zip"],
    multiple: true,
    maxFiles: 50,
    options: [
      { type: "segmented", key: "level", label: "Compression", default: "recommended", choices: [{ value: "low", label: "Light" }, { value: "recommended", label: "Recommended" }, { value: "strong", label: "Strong" }] },
    ],
    note: "Supported: PDF, JPG, PNG, WebP, AVIF, DOCX, XLSX, PPTX and ZIP. Other formats are explained rather than faked.",
    resultLabel: "Compressed files",
  },

  // ============================== Business ==============================
  linkTool("business", "invoice-generator", "Invoice Generator", "Create professional invoices with automatic totals and taxes.", "/business/invoice/new", "receipt", ["invoice", "bill", "billing", "gst", "vat"], true),
  linkTool("business", "quote-generator", "Quote / Estimate", "Send clear price quotes and estimates.", "/business/quote/new", "file-spreadsheet", ["quote", "estimate", "quotation", "proposal price"]),
  linkTool("business", "receipt-generator", "Receipt Generator", "Issue payment receipts in seconds.", "/business/receipt/new", "receipt-text", ["receipt", "payment", "paid"]),
  linkTool("business", "purchase-order", "Purchase Order", "Create purchase orders for suppliers.", "/business/purchase-order/new", "shopping-cart", ["purchase order", "po", "supplier", "vendor"]),
  linkTool("business", "business-proposal", "Proposal", "Write structured business proposals.", "/business/templates/proposal", "file-text", ["proposal", "pitch", "scope"]),
  linkTool("business", "business-letter", "Business Letter", "Format formal business letters.", "/business/templates/business-letter", "mail", ["letter", "formal", "correspondence"]),
  linkTool("business", "offer-letter", "Offer Letter", "Prepare employment offer letters.", "/business/templates/offer-letter", "handshake", ["offer letter", "employment", "hiring"]),
  linkTool("business", "experience-certificate", "Experience Certificate", "Issue experience / relieving certificates.", "/business/templates/experience-certificate", "award", ["experience", "certificate", "relieving", "employment"]),
  linkTool("business", "salary-slip", "Salary Slip", "Generate payslips with earnings and deductions.", "/business/templates/salary-slip", "wallet", ["salary", "payslip", "payroll", "pay stub"]),

  // ============================== Career ==============================
  linkTool("career", "resume-builder", "Resume Builder", "Build an ATS-friendly resume step by step with live preview.", "/career/resume", "file-user", ["resume", "cv", "builder", "ats"], true),
  linkTool("career", "quick-resume", "Resume in 5 minutes", "Enter the essentials and get a clean ATS resume.", "/career/resume/quick", "zap", ["quick", "resume", "fast", "cv"]),
  linkTool("career", "resume-for-job", "Resume for a job", "Paste a job description and tailor your resume to it.", "/career/ats?mode=job", "target", ["job description", "tailor", "resume", "match"]),
  linkTool("career", "ats-checker", "ATS Checker", "Estimate how well your resume reads in applicant tracking systems.", "/career/ats", "gauge", ["ats", "score", "resume check", "applicant tracking"], true),
  linkTool("career", "resume-analyzer", "Resume Bullet Analyzer", "Find weak bullets and learn how to strengthen them.", "/career/analyzer", "list-checks", ["bullet", "analyze", "achievements", "action verbs"]),
  linkTool("career", "cover-letter", "Cover Letter Builder", "Write a cover letter from your resume and the job description.", "/career/cover-letter", "mail", ["cover letter", "application", "motivation letter"]),
  linkTool("career", "resume-compare", "Compare Resumes", "See differences between two resume versions.", "/career/compare", "git-compare", ["compare", "diff", "versions", "resume"]),
];

function docTool(
  slug: string,
  name: string,
  description: string,
  accept: FileKind[],
  processor: string,
  keywords: string[],
  extra: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    slug,
    name,
    description,
    category: "document",
    alsoIn: ["conversion"],
    keywords,
    icon: "file-type",
    status: "available",
    ui: "processor",
    runtime: "browser",
    processor,
    accept,
    multiple: true,
    maxFiles: 20,
    ...extra,
  };
}

// ---------- queries ----------
const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));

export function getTool(slug: string): ToolDefinition | undefined {
  return bySlug.get(slug);
}

export function toolHref(tool: ToolDefinition): string {
  return tool.ui === "link" && tool.href ? tool.href : `/tools/${tool.slug}`;
}

export function toolsInCategory(category: ToolCategoryId): ToolDefinition[] {
  return TOOLS.filter((t) => t.category === category || t.alsoIn?.includes(category));
}

export function popularTools(): ToolDefinition[] {
  const order = ["compress-pdf", "merge-pdf", "pdf-to-word", "jpg-to-pdf", "compress-image", "resize-image", "convert-image", "ocr"];
  return order.map((s) => bySlug.get(s)).filter((t): t is ToolDefinition => Boolean(t));
}

/** Tools that get their own /tools/[slug] page. */
export function pageTools(): ToolDefinition[] {
  return TOOLS.filter((t) => t.ui !== "link");
}

export function defaultOptions(tool: ToolDefinition): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of tool.options ?? []) out[f.key] = f.default;
  return { ...out, ...tool.preset };
}
