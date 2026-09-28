import type { SectionKey } from "@/lib/ats/sections";

export type ResumeTemplateId = "classic" | "professional" | "technical" | "executive" | "graduate" | "academic";

export interface ResumeContact {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface ExperienceItem {
  id: string;
  title: string;
  company: string;
  location: string;
  start: string; // YYYY-MM
  end: string;
  current: boolean;
  bullets: string[];
}

export interface EducationItem {
  id: string;
  degree: string;
  institution: string;
  location: string;
  start: string;
  end: string;
  gpa: string;
  coursework: string;
}

export interface SkillGroup {
  id: string;
  name: string;
  items: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  description: string;
  technologies: string;
  bullets: string[];
  url: string;
}

export interface SimpleItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  description: string;
}

export interface Resume {
  id: string;
  /** Version name, e.g. "Frontend Developer — 2026". */
  name: string;
  contact: ResumeContact;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillGroup[];
  projects: ProjectItem[];
  certifications: SimpleItem[];
  awards: SimpleItem[];
  publications: SimpleItem[];
  volunteer: SimpleItem[];
  languages: SimpleItem[];
  interests: string;
  sectionOrder: SectionKey[];
  hidden: SectionKey[];
  template: ResumeTemplateId;
  /** Target job description kept with this version (optional). */
  jobDescription: string;
  createdAt: number;
  updatedAt: number;
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  awards: "Awards",
  publications: "Publications",
  volunteer: "Volunteer Experience",
  languages: "Languages",
  interests: "Interests",
};

export const DEFAULT_ORDER: SectionKey[] = ["summary", "experience", "education", "skills", "projects", "certifications", "awards", "publications", "volunteer", "languages", "interests"];

export const RESUME_TEMPLATES: Array<{ id: ResumeTemplateId; name: string; description: string; order?: SectionKey[] }> = [
  { id: "classic", name: "ATS Classic", description: "Simple single-column layout. Works for almost any role." },
  { id: "professional", name: "ATS Professional", description: "Clean layout with subtle accent rules." },
  { id: "technical", name: "ATS Technical", description: "Skills first — for software and engineering roles.", order: ["summary", "skills", "experience", "projects", "education", "certifications", "awards", "publications", "volunteer", "languages", "interests"] },
  { id: "executive", name: "ATS Executive", description: "Serif typography, leadership-focused summary.", order: ["summary", "experience", "education", "awards", "certifications", "skills", "projects", "publications", "volunteer", "languages", "interests"] },
  { id: "graduate", name: "ATS Graduate", description: "Education and projects first — for students and new grads.", order: ["summary", "education", "projects", "experience", "skills", "certifications", "awards", "volunteer", "languages", "publications", "interests"] },
  { id: "academic", name: "ATS Academic", description: "Academic CV with publications near the top.", order: ["summary", "education", "publications", "experience", "awards", "projects", "skills", "certifications", "volunteer", "languages", "interests"] },
];

export const uid = () => crypto.randomUUID();

export const newExperience = (): ExperienceItem => ({ id: uid(), title: "", company: "", location: "", start: "", end: "", current: false, bullets: [""] });
export const newEducation = (): EducationItem => ({ id: uid(), degree: "", institution: "", location: "", start: "", end: "", gpa: "", coursework: "" });
export const newProject = (): ProjectItem => ({ id: uid(), name: "", role: "", description: "", technologies: "", bullets: [""], url: "" });
export const newSimple = (): SimpleItem => ({ id: uid(), title: "", subtitle: "", date: "", description: "" });

export function newResume(name = "My resume"): Resume {
  return {
    id: uid(),
    name,
    contact: { fullName: "", title: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
    summary: "",
    experience: [newExperience()],
    education: [newEducation()],
    skills: [{ id: uid(), name: "Skills", items: [] }],
    projects: [],
    certifications: [],
    awards: [],
    publications: [],
    volunteer: [],
    languages: [],
    interests: "",
    sectionOrder: DEFAULT_ORDER,
    hidden: [],
    template: "classic",
    jobDescription: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Sections that have real content (empty sections are never exported). */
export function filledSections(r: Resume): SectionKey[] {
  const filled: Record<SectionKey, boolean> = {
    summary: Boolean(r.summary.trim()),
    experience: r.experience.some((e) => e.title.trim() || e.company.trim()),
    education: r.education.some((e) => e.degree.trim() || e.institution.trim()),
    skills: r.skills.some((g) => g.items.some((i) => i.trim())),
    projects: r.projects.some((p) => p.name.trim()),
    certifications: r.certifications.some((c) => c.title.trim()),
    awards: r.awards.some((c) => c.title.trim()),
    publications: r.publications.some((c) => c.title.trim()),
    volunteer: r.volunteer.some((c) => c.title.trim()),
    languages: r.languages.some((c) => c.title.trim()),
    interests: Boolean(r.interests.trim()),
  };
  return r.sectionOrder.filter((k) => filled[k] && !r.hidden.includes(k));
}

export function allSkills(r: Resume): string[] {
  return [...new Set(r.skills.flatMap((g) => g.items.map((i) => i.trim()).filter(Boolean)))];
}

/** Years of experience from non-overlapping date ranges. */
export function experienceYears(r: Resume, now = new Date()): number | null {
  const ranges = r.experience
    .map((e) => {
      const s = /^(\d{4})-(\d{2})$/.exec(e.start);
      if (!s) return null;
      const start = Number(s[1]) * 12 + Number(s[2]) - 1;
      const eMatch = /^(\d{4})-(\d{2})$/.exec(e.end);
      const end = e.current || !eMatch ? now.getFullYear() * 12 + now.getMonth() : Number(eMatch[1]) * 12 + Number(eMatch[2]) - 1;
      return end >= start ? ([start, end] as const) : null;
    })
    .filter((x): x is readonly [number, number] => x !== null)
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) return null;
  let months = 0;
  let [cs, ce] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      months += ce - cs + 1;
      [cs, ce] = [s, e];
    }
  }
  months += ce - cs + 1;
  return Math.round((months / 12) * 10) / 10;
}

export function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
