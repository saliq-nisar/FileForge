import { allSkills, DEFAULT_ORDER, filledSections, formatMonth, RESUME_TEMPLATES, SECTION_LABELS, type Resume } from "@/features/career/resume-model";
import { DEFAULT_THEME, plain, type Block, type DocumentModel, type Inline } from "@/services/documents/model";
import type { SectionKey } from "@/lib/ats/sections";

/*
 * ATS-friendly resume templates. Rules shared by all templates:
 * single column · standard section headings · real text (no images/icons for
 * essential info) · no tables or text boxes · contact info in the body, never
 * in headers/footers · ATS-safe fonts (Arial-compatible or Times).
 */

const dateRange = (start: string, end: string, current: boolean) => {
  const s = formatMonth(start);
  const e = current ? "Present" : formatMonth(end);
  return s && e ? `${s} – ${e}` : s || e;
};

function entryHeader(left: Inline[], right: string, sub?: string): Block[] {
  return [
    { type: "paragraph", runs: [...left, ...(right ? [{ text: `  |  ${right}` }] : [])], spaceAfter: sub ? 0 : 2 },
    ...(sub ? [{ type: "paragraph", runs: plain(sub, { italic: true }), spaceAfter: 2 } as Block] : []),
  ];
}

const bulletsBlock = (bullets: string[]): Block[] => {
  const items = bullets.map((b) => b.trim()).filter(Boolean);
  return items.length ? [{ type: "list", items: items.map((b) => plain(b)) }] : [];
};

function sectionBlocks(r: Resume, key: SectionKey): Block[] {
  switch (key) {
    case "summary":
      return [{ type: "paragraph", runs: plain(r.summary.trim()) }];
    case "experience":
      return r.experience
        .filter((e) => e.title.trim() || e.company.trim())
        .flatMap((e) => [
          ...entryHeader([{ text: e.title.trim(), bold: true }, ...(e.company.trim() ? [{ text: `, ${e.company.trim()}` }] : [])], dateRange(e.start, e.end, e.current), e.location.trim() || undefined),
          ...bulletsBlock(e.bullets),
        ]);
    case "education":
      return r.education
        .filter((e) => e.degree.trim() || e.institution.trim())
        .flatMap((e) => [
          ...entryHeader([{ text: e.degree.trim(), bold: true }, ...(e.institution.trim() ? [{ text: `, ${e.institution.trim()}` }] : [])], dateRange(e.start, e.end, false), e.location.trim() || undefined),
          ...(e.gpa.trim() ? [{ type: "paragraph", runs: plain(`GPA: ${e.gpa.trim()}`), spaceAfter: 1 } as Block] : []),
          ...(e.coursework.trim() ? [{ type: "paragraph", runs: plain(`Relevant coursework: ${e.coursework.trim()}`) } as Block] : []),
        ]);
    case "skills":
      return r.skills
        .filter((g) => g.items.some((i) => i.trim()))
        .map((g) => ({ type: "paragraph", runs: [{ text: `${g.name.trim() || "Skills"}: `, bold: true }, { text: g.items.map((i) => i.trim()).filter(Boolean).join(", ") }], spaceAfter: 2 }) as Block);
    case "projects":
      return r.projects
        .filter((p) => p.name.trim())
        .flatMap((p) => [
          ...entryHeader([{ text: p.name.trim(), bold: true }, ...(p.role.trim() ? [{ text: `, ${p.role.trim()}` }] : [])], p.url.trim()),
          ...(p.description.trim() ? [{ type: "paragraph", runs: plain(p.description.trim()), spaceAfter: 2 } as Block] : []),
          ...(p.technologies.trim() ? [{ type: "paragraph", runs: [{ text: "Technologies: ", bold: true }, { text: p.technologies.trim() }], spaceAfter: 2 } as Block] : []),
          ...bulletsBlock(p.bullets),
        ]);
    case "interests":
      return [{ type: "paragraph", runs: plain(r.interests.trim()) }];
    default: {
      const items = r[key].filter((i) => i.title.trim());
      return items.flatMap((i) => [
        ...entryHeader([{ text: i.title.trim(), bold: true }, ...(i.subtitle.trim() ? [{ text: `, ${i.subtitle.trim()}` }] : [])], i.date.trim()),
        ...(i.description.trim() ? [{ type: "paragraph", runs: plain(i.description.trim()) } as Block] : []),
      ]);
    }
  }
}

export function buildResumeModel(r: Resume): DocumentModel {
  const tpl = RESUME_TEMPLATES.find((t) => t.id === r.template) ?? RESUME_TEMPLATES[0];
  const serif = r.template === "executive" || r.template === "academic";
  const accent = r.template === "professional" ? "#1e3a8a" : r.template === "technical" ? "#0f766e" : "#111827";
  const c = r.contact;
  const contactLine = [c.email, c.phone, c.location].map((x) => x.trim()).filter(Boolean).join("  |  ");
  const links = [c.linkedin, c.github, c.portfolio].map((x) => x.trim()).filter(Boolean).join("  |  ");

  // Template order when chosen, but keep the user's custom order if they reordered sections.
  const baseOrder = r.sectionOrder;
  const order = tpl.order && baseOrder.join() === DEFAULT_ORDER.join() ? tpl.order : baseOrder;
  const sections = filledSections({ ...r, sectionOrder: order });

  const blocks: Block[] = [
    { type: "heading", level: 1, text: c.fullName.trim() || "Your Name", align: r.template === "executive" ? "center" : "left", size: 20 },
    ...(c.title.trim() ? [{ type: "paragraph", runs: plain(c.title.trim(), { bold: true, color: accent }), size: 11.5, align: r.template === "executive" ? "center" : "left", spaceAfter: 2 } as Block] : []),
    ...(contactLine ? [{ type: "paragraph", runs: plain(contactLine), align: r.template === "executive" ? "center" : "left", spaceAfter: 1 } as Block] : []),
    ...(links ? [{ type: "paragraph", runs: plain(links), align: r.template === "executive" ? "center" : "left", spaceAfter: 4 } as Block] : []),
  ];

  for (const key of sections) {
    const label = key === "summary" && r.template === "executive" ? "Executive Summary" : SECTION_LABELS[key];
    blocks.push({ type: "heading", level: 2, text: label, uppercase: r.template !== "academic", rule: r.template !== "graduate", color: accent, size: 11.5 });
    blocks.push(...sectionBlocks(r, key));
  }

  return {
    title: `${c.fullName.trim() || "Resume"}${c.title.trim() ? ` — ${c.title.trim()}` : ""}`,
    author: c.fullName.trim() || undefined,
    subject: "Resume",
    keywords: allSkills(r).slice(0, 30),
    pageSize: "letter",
    theme: { ...DEFAULT_THEME, font: serif ? "serif" : "sans", size: serif ? 10.5 : 10, margin: 50, accent, text: "#111111", muted: "#555555", lineHeight: 1.3 },
    blocks,
  };
}
