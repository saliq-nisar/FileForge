import { AppError } from "@/lib/errors";
import { detectFormat } from "@/lib/file/detect";
import type { FormattingFinding } from "@/lib/ats/score";
import { BULLET_LINE, detectContact, detectName, detectSections, type SectionKey } from "@/lib/ats/sections";
import { newResume, uid, type Resume } from "./resume-model";

export interface ExtractedResume {
  text: string;
  formatting: FormattingFinding[];
  pageCount?: number;
}

/**
 * Extract text from a PDF/DOCX/TXT resume and inspect how ATS-friendly the
 * file's formatting is. Everything runs in the browser.
 */
export async function extractResume(file: File): Promise<ExtractedResume> {
  const format = await detectFormat(file);
  if (format.kind === "pdf") return extractPdf(file);
  if (format.kind === "docx") return extractDocx(file);
  if (format.family === "text") return { text: await file.text(), formatting: [] };
  throw new AppError("UNSUPPORTED_FORMAT", "Upload your resume as PDF, DOCX or TXT.");
}

async function extractPdf(file: File): Promise<ExtractedResume> {
  const { openPdf, closePdf } = await import("@/services/pdf/pdfjs");
  const { OPS } = await import("pdfjs-dist");
  const doc = await openPdf(await file.arrayBuffer());
  const findings: FormattingFinding[] = [];
  const lines: string[] = [];
  let images = 0;
  let columnsLikely = 0;
  let chars = 0;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const width = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      // Group items into lines by y; detect two text columns by x distribution.
      const rows = new Map<number, Array<{ x: number; s: string }>>();
      let leftHalf = 0;
      let rightHalf = 0;
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        chars += item.str.length;
        if (x < width * 0.45) leftHalf++;
        else if (x > width * 0.5) rightHalf++;
        const row = rows.get(y) ?? [];
        row.push({ x, s: item.str });
        rows.set(y, row);
      }
      const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]);
      // Rows that have text in both halves with a big horizontal gap suggest columns.
      let splitRows = 0;
      for (const [, row] of sorted) {
        row.sort((a, b) => a.x - b.x);
        const gaps = row.slice(1).map((r, j) => r.x - row[j].x);
        if (gaps.some((g) => g > width * 0.3)) splitRows++;
        lines.push(row.map((r) => r.s).join(" ").replace(/\s+/g, " ").trim());
      }
      if (sorted.length > 10 && splitRows / sorted.length > 0.4 && rightHalf > leftHalf * 0.3) columnsLikely++;
      const ops = await page.getOperatorList();
      images += ops.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject).length;
      page.cleanup();
    }
  } finally {
    await closePdf(doc);
  }
  if (chars < 200) findings.push({ id: "no-text", message: "Little or no selectable text — the resume may be a scanned image. ATS software can't read text in images.", penalty: 20 });
  if (images > 0) findings.push({ id: "images", message: `${images} image${images === 1 ? "" : "s"} found. Keep essential information as text, not images.`, penalty: images > 2 ? 4 : 2 });
  if (columnsLikely) findings.push({ id: "columns", message: "Multi-column layout detected. Some ATS read columns in the wrong order — a single column is safest.", penalty: 4 });
  return { text: lines.join("\n"), formatting: findings, pageCount: doc.numPages };
}

async function extractDocx(file: File): Promise<ExtractedResume> {
  const JSZip = (await import("jszip")).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const findings: FormattingFinding[] = [];
  const tables = (xml.match(/<w:tbl>/g) ?? []).length;
  const textBoxes = (xml.match(/<w:txbxContent/g) ?? []).length;
  const drawings = (xml.match(/<w:drawing>/g) ?? []).length - textBoxes;
  const cols = /<w:cols [^>]*w:num="([2-9])"/.exec(xml);
  if (tables) findings.push({ id: "tables", message: `${tables} table${tables === 1 ? "" : "s"} found. Tables can scramble reading order in some ATS.`, penalty: tables > 1 ? 4 : 3 });
  if (textBoxes) findings.push({ id: "textboxes", message: `${textBoxes} text box${textBoxes === 1 ? "" : "es"} found. Text inside text boxes is often skipped by ATS.`, penalty: 4 });
  if (drawings > 0) findings.push({ id: "images", message: `${drawings} image${drawings === 1 ? "" : "s"} or graphics found. Keep essential information as text.`, penalty: 2 });
  if (cols) findings.push({ id: "columns", message: `${cols[1]}-column page layout detected. A single column is safest.`, penalty: 4 });
  // Contact details in headers/footers are skipped by some parsers.
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    const hf = (await zip.file(name)!.async("string")).replace(/<[^>]+>/g, " ");
    if (/@|\+?\d[\d\s().-]{7,}/.test(hf)) {
      findings.push({ id: "header-contact", message: "Contact details are in the page header/footer. Some ATS ignore headers and footers — move them into the body.", penalty: 3 });
      break;
    }
  }
  const { docxToPlainText } = await import("@/services/document/convert");
  return { text: await docxToPlainText(buf), formatting: findings };
}

/**
 * Deterministically convert resume text into the structured builder model.
 * Imperfect by nature — the user reviews everything before exporting.
 */
export function parseResumeText(text: string): Resume {
  const r = newResume("Imported resume");
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const { sections } = detectSections(text);
  const contact = detectContact(text);
  const name = detectName(text) ?? "";
  r.contact = {
    ...r.contact,
    fullName: name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    linkedin: contact.linkedin ?? "",
    github: contact.github ?? "",
    portfolio: contact.website ?? "",
  };
  const nameIdx = lines.findIndex((l) => l.trim() === name);
  const titleLine = nameIdx >= 0 ? lines[nameIdx + 1]?.trim() ?? "" : "";
  if (titleLine && !/[@\d|]/.test(titleLine) && titleLine.length < 60) r.contact.title = titleLine;

  const body = (key: SectionKey) => {
    const s = sections.find((x) => x.key === key);
    return s ? lines.slice(s.start + 1, s.end).filter((l) => l.trim()) : [];
  };

  r.summary = body("summary").join(" ").trim();

  const DATE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?(19|20)\d{2}\s*[-–—to]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((19|20)\d{2}|present|current|now)/i;
  const toYm = (s: string | undefined) => {
    if (!s) return "";
    const m = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})/i.exec(s);
    if (!m) return "";
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = m[1] ? months.indexOf(m[1].toLowerCase().slice(0, 3)) + 1 : 1;
    return `${m[2]}-${String(mi).padStart(2, "0")}`;
  };

  const exp = body("experience");
  if (exp.length) {
    r.experience = [];
    let cur: Resume["experience"][number] | null = null;
    for (const line of exp) {
      if (BULLET_LINE.test(line)) {
        if (!cur) cur = { id: uid(), title: "", company: "", location: "", start: "", end: "", current: false, bullets: [] };
        cur.bullets.push(line.replace(BULLET_LINE, "").trim());
        continue;
      }
      const date = DATE.exec(line);
      if (date || !cur || cur.bullets.length) {
        if (cur) r.experience.push(cur);
        const [start, end] = date ? date[0].split(/\s*[-–—]\s*|\s+to\s+/i) : ["", ""];
        const heading = line.replace(DATE, "").replace(/[|,–—-]\s*$/, "").trim();
        const [title, company] = heading.split(/\s+(?:at|@)\s+|\s*[|,–—]\s*/);
        cur = { id: uid(), title: title?.trim() ?? "", company: company?.trim() ?? "", location: "", start: toYm(start), end: /present|current|now/i.test(end ?? "") ? "" : toYm(end), current: /present|current|now/i.test(end ?? ""), bullets: [] };
      } else if (!cur.company) {
        cur.company = line.replace(DATE, "").trim();
      } else {
        cur.bullets.push(line.trim());
      }
    }
    if (cur) r.experience.push(cur);
    r.experience.forEach((e) => e.bullets.length === 0 && e.bullets.push(""));
  }

  const edu = body("education");
  if (edu.length) {
    r.education = [];
    for (let i = 0; i < edu.length; i++) {
      const line = edu[i];
      if (BULLET_LINE.test(line) && r.education.length) {
        r.education[r.education.length - 1].coursework += `${r.education[r.education.length - 1].coursework ? "; " : ""}${line.replace(BULLET_LINE, "")}`;
        continue;
      }
      const date = DATE.exec(line) ?? /\b(19|20)\d{2}\b/.exec(line);
      const clean = line.replace(DATE, "").replace(/\b(19|20)\d{2}\b/, "").replace(/[|,–—-]\s*$/, "").trim();
      const [degree, institution] = clean.split(/\s*[|,–—]\s*|\s+at\s+/);
      r.education.push({ id: uid(), degree: degree ?? "", institution: institution ?? "", location: "", start: "", end: date ? toYm(date[0].split(/[-–—]/).pop()) : "", gpa: /gpa[:\s]*([\d.]+)/i.exec(line)?.[1] ?? "", coursework: "" });
    }
  }

  const skills = body("skills");
  if (skills.length) {
    r.skills = skills.map((l) => {
      const [label, rest] = l.includes(":") ? [l.split(":")[0], l.split(":").slice(1).join(":")] : ["Skills", l];
      return { id: uid(), name: label.replace(BULLET_LINE, "").trim(), items: rest.split(/[,;|•·]/).map((s) => s.trim()).filter(Boolean) };
    });
    // Merge groups with the same name.
    const merged = new Map<string, Resume["skills"][number]>();
    for (const g of r.skills) {
      const m = merged.get(g.name);
      if (m) m.items.push(...g.items);
      else merged.set(g.name, g);
    }
    r.skills = [...merged.values()];
  }

  const projects = body("projects");
  if (projects.length) {
    r.projects = [];
    for (const line of projects) {
      if (BULLET_LINE.test(line) && r.projects.length) r.projects[r.projects.length - 1].bullets.push(line.replace(BULLET_LINE, "").trim());
      else r.projects.push({ id: uid(), name: line.trim(), role: "", description: "", technologies: "", bullets: [], url: "" });
    }
  }

  for (const key of ["certifications", "awards", "publications", "volunteer", "languages"] as const) {
    const items = body(key);
    if (items.length) r[key] = items.map((l) => ({ id: uid(), title: l.replace(BULLET_LINE, "").trim(), subtitle: "", date: "", description: "" }));
  }
  r.interests = body("interests").join(", ");
  return r;
}
