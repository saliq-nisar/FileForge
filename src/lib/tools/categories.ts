import type { ToolCategory, ToolCategoryId } from "@/types/tools";

export const CATEGORIES: ToolCategory[] = [
  { id: "pdf", name: "PDF", description: "Merge, split, organize and edit PDFs", icon: "file-text", color: "var(--cat-pdf)" },
  { id: "image", name: "Images", description: "Convert, resize, compress and edit images", icon: "image", color: "var(--cat-image)" },
  { id: "document", name: "Documents", description: "Word, Excel, PowerPoint, CSV and text", icon: "file-type", color: "var(--cat-document)" },
  { id: "compression", name: "Compression", description: "Make files smaller without surprises", icon: "minimize", color: "var(--cat-neutral)" },
  { id: "conversion", name: "Conversion", description: "Turn one format into another", icon: "repeat", color: "var(--cat-document)" },
  { id: "editing", name: "Editing", description: "Annotate, sign and change content", icon: "pen", color: "var(--cat-pdf)" },
  { id: "ocr", name: "OCR", description: "Extract text from scans and photos", icon: "scan-text", color: "var(--cat-image)" },
  { id: "security", name: "Security", description: "Passwords, metadata and flattening", icon: "shield", color: "var(--cat-neutral)" },
  { id: "business", name: "Business", description: "Invoices, quotes, receipts and letters", icon: "briefcase", color: "var(--cat-business)" },
  { id: "career", name: "Career", description: "ATS-friendly resumes and cover letters", icon: "graduation-cap", color: "var(--cat-career)" },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: ToolCategoryId): ToolCategory {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown category ${id}`);
  return c;
}

export function isCategoryId(value: string): value is ToolCategoryId {
  return byId.has(value as ToolCategoryId);
}
