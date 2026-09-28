import { detectContact, detectName, detectSections, BULLET_LINE } from "@/lib/ats/sections";
import { findSkills } from "@/lib/ats/keywords";
import { scoreResume, type AtsInput, type AtsReport, type FormattingFinding } from "@/lib/ats/score";
import { modelToText } from "@/services/documents/model";
import { buildResumeModel } from "@/templates/resumes";
import { allSkills, experienceYears, filledSections, type Resume } from "./resume-model";

/** ATS input for a resume built in FileForge (templates are ATS-safe by design). */
export function resumeToAtsInput(r: Resume): AtsInput {
  const text = modelToText(buildResumeModel(r));
  const c = r.contact;
  return {
    text,
    name: c.fullName.trim() || null,
    contact: { email: c.email.trim() || null, phone: c.phone.trim() || null, linkedin: c.linkedin || null, github: c.github || null, website: c.portfolio || null },
    sections: filledSections(r),
    unusualHeadings: [],
    bullets: [...r.experience.flatMap((e) => e.bullets), ...r.projects.flatMap((p) => p.bullets)].filter((b) => b.trim()),
    listedSkills: allSkills(r),
    titles: [c.title, ...r.experience.map((e) => e.title)].filter((t) => t.trim()),
    formatting: [],
    experienceYears: experienceYears(r),
  };
}

export function analyzeResume(r: Resume, jobDescription?: string): AtsReport {
  return scoreResume(resumeToAtsInput(r), jobDescription ?? r.jobDescription);
}

/** ATS input from plain text of an uploaded/pasted resume plus file formatting findings. */
export function textToAtsInput(text: string, formatting: FormattingFinding[] = []): AtsInput {
  const { sections, unusualHeadings } = detectSections(text);
  const lines = text.split(/\r?\n/);
  const skillsSection = sections.find((s) => s.key === "skills");
  const listed = skillsSection
    ? lines.slice(skillsSection.start + 1, skillsSection.end).join(", ").split(/[,;|•·]/).map((s) => s.replace(/^[^:]*:\s*/, "").trim()).filter((s) => s && s.length < 40)
    : findSkills(text).map((s) => s.name);
  const expSection = sections.find((s) => s.key === "experience");
  const titles = expSection
    ? lines.slice(expSection.start + 1, expSection.end).filter((l) => l.trim() && !BULLET_LINE.test(l) && l.trim().length < 90).slice(0, 12)
    : [];
  // Years from explicit ranges like "Jan 2020 – Present" or "2018 - 2021".
  const now = new Date().getFullYear();
  const years = [...text.matchAll(/\b(19\d{2}|20\d{2})\s*[-–—to]+\s*(present|current|now|19\d{2}|20\d{2})\b/gi)].map((m) => {
    const end = /\d/.test(m[2]) ? Number(m[2]) : now;
    return Math.max(0, end - Number(m[1]));
  });
  return {
    text,
    name: detectName(text),
    contact: detectContact(text),
    sections: [...new Set(sections.map((s) => s.key))],
    unusualHeadings,
    bullets: lines.filter((l) => BULLET_LINE.test(l)).map((l) => l.replace(BULLET_LINE, "")),
    listedSkills: [...new Set(listed)],
    titles: [detectName(text) ? lines[lines.findIndex((l) => l.trim() === detectName(text)) + 1] ?? "" : "", ...titles].filter(Boolean),
    formatting,
    experienceYears: years.length ? Math.min(40, years.reduce((a, b) => a + b, 0)) : null,
  };
}
