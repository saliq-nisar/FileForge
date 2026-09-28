import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { newBusinessDocument, newLineItem } from "@/features/business/model";
import { newResume } from "@/features/career/resume-model";
import { modelToText } from "@/services/documents/model";
import { renderDocx } from "@/services/documents/render-docx";
import { renderPdf } from "@/services/documents/render-pdf";
import { buildBusinessModel } from "@/templates/invoices";
import { LETTER_TEMPLATES, defaultTemplateValues } from "@/templates/letters";
import { buildResumeModel } from "@/templates/resumes";

function invoice() {
  const d = newBusinessDocument("invoice", "INV-2026-0001", null);
  d.currency = "USD";
  d.from.name = "Forge Studio";
  d.to.name = "Łukasz Żółć GmbH"; // non-Latin-1 characters must survive in the PDF
  d.taxes = [{ id: "vat", name: "VAT", rate: 20, compound: false }];
  d.items = [{ ...newLineItem(), description: "Design work", quantity: 10, unitPrice: 85, taxIds: ["vat"] }];
  return d;
}

describe("invoice export", () => {
  it("renders every template to a valid PDF", async () => {
    for (const template of ["professional", "minimal", "modern", "corporate", "elegant", "simple", "tax"] as const) {
      const bytes = await renderPdf(buildBusinessModel({ ...invoice(), template }));
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount(), template).toBeGreaterThanOrEqual(1);
      expect(pdf.getTitle()).toBe("Invoice INV-2026-0001");
    }
  });

  it("shows correct totals in the document text", () => {
    const text = modelToText(buildBusinessModel(invoice()));
    expect(text).toContain("$850.00");
    expect(text).toContain("$170.00");
    expect(text).toContain("$1,020.00");
  });

  it("renders a native DOCX with real text and tables", async () => {
    const blob = await renderDocx(buildBusinessModel(invoice()));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Design work");
    expect(xml).toContain("<w:tbl>");
  });

  it("paginates long item tables", async () => {
    const d = invoice();
    d.items = Array.from({ length: 120 }, (_, i) => ({ ...newLineItem(), description: `Item ${i + 1}`, quantity: 1, unitPrice: 1 }));
    const pdf = await PDFDocument.load(await renderPdf(buildBusinessModel(d)));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});

describe("letter templates", () => {
  it("build and render with default values", async () => {
    for (const t of LETTER_TEMPLATES) {
      const model = t.build(defaultTemplateValues(t));
      expect(model.blocks.length, t.slug).toBeGreaterThan(0);
      expect((await PDFDocument.load(await renderPdf(model))).getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("resume export", () => {
  it("produces a text-based resume with standard headings in every template", async () => {
    const r = newResume();
    r.contact.fullName = "Jane Doe";
    r.contact.email = "jane@example.com";
    r.summary = "Engineer.";
    r.experience[0] = { ...r.experience[0], title: "Engineer", company: "Acme", start: "2020-01", current: true, bullets: ["Built things"] };
    r.skills[0].items = ["React"];
    for (const template of ["classic", "professional", "technical", "executive", "graduate", "academic"] as const) {
      const model = buildResumeModel({ ...r, template });
      const text = modelToText(model);
      expect(text, template).toMatch(/EXPERIENCE|Experience/);
      expect(text).toContain("jane@example.com");
      expect(model.blocks.some((b) => b.type === "table" || b.type === "columns" || b.type === "image"), template).toBe(false);
      expect((await PDFDocument.load(await renderPdf(model))).getPageCount()).toBe(1);
    }
  });

  it("omits empty sections", () => {
    const r = newResume();
    r.contact.fullName = "A B";
    const text = modelToText(buildResumeModel(r));
    expect(text).not.toMatch(/EDUCATION|PROJECTS/);
  });
});
