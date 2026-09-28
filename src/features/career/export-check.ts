import { normalizeText } from "@/lib/ats/normalize";
import { buildResumeModel } from "@/templates/resumes";
import { allSkills, filledSections, SECTION_LABELS, type Resume } from "./resume-model";

export interface ExportCheckItem {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ExportCheckResult {
  items: ExportCheckItem[];
  /** Share of resume words recovered from the generated PDF (0-1). */
  coverage: number;
  pdf: Uint8Array;
}

function words(s: string): string[] {
  return normalizeText(s).match(/[a-z0-9]+/g) ?? [];
}

/**
 * ATS export check: generate the PDF, extract its text with PDF.js and verify
 * that the content survived (selectable text, sections, contact, experience, skills).
 */
export async function runExportCheck(r: Resume): Promise<ExportCheckResult> {
  const model = buildResumeModel(r);
  const { renderPdf } = await import("@/services/documents/render-pdf");
  const pdf = await renderPdf(model);
  const { openPdf, extractAllText, closePdf } = await import("@/services/pdf/pdfjs");
  const doc = await openPdf(pdf);
  let extracted = "";
  try {
    extracted = (await extractAllText(doc)).map((p) => p.paragraphs.join("\n")).join("\n");
  } finally {
    await closePdf(doc);
  }
  const norm = normalizeText(extracted);
  const has = (s: string) => !s.trim() || norm.includes(normalizeText(s).trim());

  const sourceWords = words([r.summary, ...r.experience.flatMap((e) => [e.title, e.company, ...e.bullets]), ...allSkills(r)].join(" "));
  const extractedWords = new Set(words(extracted));
  const coverage = sourceWords.length ? sourceWords.filter((w) => extractedWords.has(w)).length / sourceWords.length : 1;
  const sections = filledSections(r);

  const items: ExportCheckItem[] = [
    { label: "Text is selectable", ok: extracted.trim().length > 50 },
    { label: "Sections detected", ok: sections.every((k) => norm.includes(normalizeText(SECTION_LABELS[k]))), detail: sections.map((k) => SECTION_LABELS[k]).join(", ") },
    { label: "Contact information detected", ok: has(r.contact.email) && has(r.contact.phone) && Boolean(r.contact.email || r.contact.phone) },
    { label: "Experience detected", ok: r.experience.filter((e) => e.title.trim()).every((e) => has(e.title)) && sections.includes("experience") },
    { label: "Skills detected", ok: allSkills(r).every((s) => has(s)) && allSkills(r).length > 0 },
    { label: "No major text loss", ok: coverage >= 0.97, detail: `${Math.round(coverage * 100)}% of words recovered` },
  ];
  return { items, coverage, pdf };
}
