import { AMBIGUOUS, SKILLS, type SkillCategory, type SkillEntry } from "./skills";
import { STOPWORDS, containsPhrase, escapeRegExp, normalizeText, stem, tokenize } from "./normalize";

export interface FoundSkill {
  name: string;
  category: SkillCategory;
}

/** Find dictionary skills mentioned in text (deterministic, alias-aware). */
export function findSkills(text: string): FoundSkill[] {
  const norm = normalizeText(text);
  const found: FoundSkill[] = [];
  for (const s of SKILLS) {
    if (matchesSkill(s, text, norm)) found.push({ name: s.name, category: s.category });
  }
  return found;
}

export function matchesSkill(s: SkillEntry, original: string, normalized: string): boolean {
  if (AMBIGUOUS.has(s.name)) {
    // Unambiguous aliases (e.g. "golang") always count.
    if (s.aliases.some((a) => containsPhrase(normalized, a))) return true;
    if (s.name.length <= 2) {
      // Short names like "C", "R" or "Go" only count inside skill lists: "C, C++" or "Go / Rust".
      return new RegExp(`(^|[,;/(|•:]\\s*)${escapeRegExp(s.name)}\\s*(?=[,;/)|]|$)`, "m").test(original);
    }
    // Otherwise a case-sensitive whole-token match ("Swift", not "swift delivery").
    return new RegExp(`(^|[^A-Za-z0-9+#])${escapeRegExp(s.name)}(?![A-Za-z0-9+#])`).test(original);
  }
  return [s.name, ...s.aliases].some((n) => containsPhrase(normalized, n));
}

export interface JobKeywords {
  /** Detected job title (first heading-like line or "Job title:" field). */
  title: string | null;
  skills: FoundSkill[];
  /** Additional important terms from requirement lines (not in the skills dictionary). */
  keywords: string[];
  certifications: string[];
  education: string[];
  yearsRequired: number | null;
}

const EDUCATION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(ph\.?d|doctorate)\b/i, "PhD"],
  [/\b(master'?s|m\.?s\.?c?|mba|m\.?eng)\b/i, "Master's degree"],
  [/\b(bachelor'?s|b\.?s\.?c?|b\.?a\.?|b\.?tech|b\.?e\.?|undergraduate degree)\b/i, "Bachelor's degree"],
  [/\bassociate'?s? degree\b/i, "Associate degree"],
  [/\bhigh school|diploma\b/i, "High school diploma"],
];

const TITLE_HINT = /\b(engineer|developer|manager|designer|analyst|scientist|specialist|coordinator|consultant|director|lead|architect|administrator|associate|assistant|officer|accountant|representative|executive|intern|technician|nurse|teacher|writer|editor|recruiter|strategist|marketer|product owner)\b/i;

export function detectJobTitle(jd: string): string | null {
  const explicit = /(?:job title|position|role)\s*[:\-–]\s*(.+)/i.exec(jd);
  if (explicit) return explicit[1].trim().slice(0, 80);
  for (const raw of jd.split(/\n/).slice(0, 8)) {
    const line = raw.trim().replace(/^#+\s*/, "");
    if (line && line.length <= 70 && TITLE_HINT.test(line) && !/[.!?]$/.test(line)) return line;
  }
  const inline = /(?:hiring|looking for|seeking)\s+(?:an?|our next)\s+((?:senior |junior |lead |staff |principal )?[a-z ]{2,40}?(?:engineer|developer|manager|designer|analyst|scientist|specialist|consultant|architect|accountant))/i.exec(jd);
  return inline ? inline[1].replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

/** Lines that state requirements (bullets or lines under requirement headings). */
export function requirementLines(jd: string): string[] {
  const lines = jd.split(/\n/).map((l) => l.trim());
  const out: string[] = [];
  let inReq = false;
  for (const l of lines) {
    if (/^(requirements|qualifications|what you('| wi)ll need|what we('re| are) looking for|must have|you have|skills|nice to have|preferred|responsibilities|what you('| wi)ll do)\b/i.test(l.replace(/[:#*]/g, "").trim())) {
      inReq = true;
      continue;
    }
    if (/^[-•*·▪◦]|^\d+[.)]/.test(l) || inReq) {
      if (l) out.push(l.replace(/^[-•*·▪◦]\s*|^\d+[.)]\s*/, ""));
    }
  }
  return out.length ? out : lines.filter(Boolean);
}

/**
 * Extract keywords from a job description. Everything returned appears in
 * the job description — nothing is invented.
 */
export function extractJobKeywords(jd: string): JobKeywords {
  const skills = findSkills(jd);
  const certifications = skills.filter((s) => s.category === "certification").map((s) => s.name);
  const known = new Set(skills.flatMap((s) => tokenize(s.name)));

  // Frequent meaningful terms in requirement lines that aren't dictionary skills.
  const counts = new Map<string, { n: number; display: string }>();
  for (const line of requirementLines(jd)) {
    const words = line.match(/[A-Za-z][A-Za-z0-9+#.\-/]*[A-Za-z0-9+#]|[A-Za-z]/g) ?? [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const t = stem(normalizeText(w));
      if (t.length < 3 || STOPWORDS.has(normalizeText(w)) || known.has(normalizeText(w))) continue;
      // Proper nouns / acronyms in the middle of a sentence are strong signals.
      const weight = /^[A-Z]{2,}$/.test(w) ? 2 : /^[A-Z]/.test(w) && i > 0 ? 1.5 : 1;
      const cur = counts.get(t) ?? { n: 0, display: w };
      cur.n += weight;
      counts.set(t, cur);
    }
  }
  const keywords = [...counts.entries()]
    .filter(([, v]) => v.n >= 2)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 15)
    .map(([, v]) => (/^[A-Z]{2,}$/.test(v.display) ? v.display : v.display.toLowerCase()));

  const education = [...new Set(EDUCATION_PATTERNS.filter(([re]) => re.test(jd)).map(([, label]) => label))];
  const years = [...jd.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b(?:\s+of)?(?:\s+\w+){0,4}\s+experience/gi)].map((m) => Number(m[1]));
  const yearsRequired = years.length ? Math.max(...years.filter((y) => y <= 30)) : null;

  return { title: detectJobTitle(jd), skills, keywords, certifications, education, yearsRequired: Number.isFinite(yearsRequired) ? yearsRequired : null };
}
