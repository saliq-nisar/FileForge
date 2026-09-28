/** Section and contact detection in plain resume text (uploads, pasted text, exports). */

export type SectionKey =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "awards"
  | "publications"
  | "volunteer"
  | "languages"
  | "interests";

export const STANDARD_HEADINGS: Record<SectionKey, string[]> = {
  summary: ["summary", "professional summary", "profile", "professional profile", "about me", "objective", "career objective", "career summary"],
  experience: ["experience", "work experience", "professional experience", "employment history", "work history", "employment", "career history", "relevant experience"],
  education: ["education", "academic background", "education and training", "academic qualifications", "qualifications"],
  skills: ["skills", "technical skills", "core skills", "key skills", "core competencies", "competencies", "skills and abilities", "tools and technologies", "technologies"],
  projects: ["projects", "personal projects", "selected projects", "key projects", "academic projects"],
  certifications: ["certifications", "certificates", "licenses", "licenses and certifications", "certifications and licenses"],
  awards: ["awards", "honors", "honours", "achievements", "awards and honors"],
  publications: ["publications", "papers", "research"],
  volunteer: ["volunteer", "volunteering", "volunteer experience", "community involvement"],
  languages: ["languages", "language skills"],
  interests: ["interests", "hobbies", "hobbies and interests"],
};

/** Creative headings that some ATS may not map to standard sections. */
const UNUSUAL = /^(my journey|where i've been|what i do|toolbox|my story|things i've built|superpowers|career path|about|stuff i know)$/i;

export interface DetectedSection {
  key: SectionKey;
  heading: string;
  start: number; // line index
  end: number;
}

function cleanHeading(line: string): string {
  return line.trim().replace(/^[#*_\s]+|[:*_\s]+$/g, "").replace(/\s+/g, " ").toLowerCase();
}

export function headingKey(line: string): SectionKey | null {
  const h = cleanHeading(line);
  if (!h || h.length > 40) return null;
  for (const [key, names] of Object.entries(STANDARD_HEADINGS) as Array<[SectionKey, string[]]>) {
    if (names.includes(h)) return key;
  }
  return null;
}

export function detectSections(text: string): { sections: DetectedSection[]; unusualHeadings: string[] } {
  const lines = text.split(/\r?\n/);
  const sections: DetectedSection[] = [];
  const unusualHeadings: string[] = [];
  lines.forEach((line, i) => {
    const key = headingKey(line);
    if (key) {
      if (sections.length) sections[sections.length - 1].end = i;
      sections.push({ key, heading: line.trim(), start: i, end: lines.length });
    } else if (UNUSUAL.test(cleanHeading(line))) {
      unusualHeadings.push(line.trim());
    }
  });
  return { sections, unusualHeadings };
}

export interface ContactInfo {
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
}

export function detectContact(text: string): ContactInfo {
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(text)?.[0] ?? null;
  const phone = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/.exec(text)?.[0]?.trim() ?? null;
  const linkedin = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i.exec(text)?.[0] ?? null;
  const github = /(?:https?:\/\/)?github\.com\/[A-Za-z0-9_-]+\/?/i.exec(text)?.[0] ?? null;
  const website = /https?:\/\/(?!(?:www\.)?(?:linkedin|github)\.com)[^\s,)]+/i.exec(text)?.[0] ?? null;
  return { email, phone: phone && phone.replace(/\D/g, "").length >= 7 ? phone : null, linkedin, github, website };
}

/** Guess the candidate name: first short line of capitalized words without digits or @. */
export function detectName(text: string): string | null {
  for (const raw of text.split(/\n/).slice(0, 6)) {
    const line = raw.trim();
    if (!line || line.length > 50 || /[@\d/:]/.test(line) || headingKey(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && words.every((w) => /^[A-Z][A-Za-z'.-]*$|^[A-Z]+$/.test(w))) return line;
  }
  return null;
}

export const BULLET_LINE = /^\s*(?:[-•*·▪◦‣⁃●○■□►▸]|\d+[.)])\s+/;
