import { ACTION_VERBS } from "./bullets";
import { extractJobKeywords, findSkills, type JobKeywords } from "./keywords";
import { STOPWORDS, containsPhrase, normalizeText, tokenize, wordCount } from "./normalize";
import type { ContactInfo, SectionKey } from "./sections";

/*
 * Estimated ATS compatibility score — documented, deterministic rules:
 *
 *   Structure    20  name 3 · email 3 · phone 2 · experience 4 · education 3 · skills 3 · standard headings 2
 *   Formatting   20  starts at 20; deductions for images, tables, columns, text boxes, header/footer contact, symbols
 *   Keywords     25  share of job-description keywords found in the resume          (needs a job description)
 *   Skills       20  share of job-description skills found; without a JD, 2 pts per listed skill (max 20)
 *   Job title    10  overlap between the JD title and your target/previous titles  (needs a JD with a title)
 *   Readability   5  action verbs 2 · measurable results 1.5 · bullet length 1 · overall length 0.5
 *
 * Categories that need a job description are excluded (not counted as zero)
 * when none is provided; the total is normalized to 100.
 * This is a diagnostic estimate — real ATS software varies by employer.
 */

export interface FormattingFinding {
  id: string;
  message: string;
  penalty: number;
}

export interface AtsInput {
  text: string;
  name: string | null;
  contact: ContactInfo;
  sections: SectionKey[];
  unusualHeadings: string[];
  bullets: string[];
  /** Skills explicitly listed by the user (skills section). */
  listedSkills: string[];
  /** Target title and titles held. */
  titles: string[];
  formatting: FormattingFinding[];
  experienceYears?: number | null;
}

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface CategoryScore {
  id: "structure" | "formatting" | "keywords" | "skills" | "title" | "readability";
  label: string;
  score: number;
  max: number;
  applicable: boolean;
  checks: Check[];
}

export interface JobMatch {
  percent: number;
  jobTitle: string | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  matchedSkills: string[];
  missingSkills: string[];
  titleOverlap: number;
  yearsRequired: number | null;
  yearsFound: number | null;
  educationRequired: string[];
}

export interface AtsReport {
  total: number;
  categories: CategoryScore[];
  match: JobMatch | null;
  recommendations: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function significantTokens(s: string): Set<string> {
  return new Set(tokenize(s).filter((t) => !STOPWORDS.has(t) && !/^(senior|junior|lead|staff|principal|sr|jr|i|ii|iii|iv)$/.test(t)));
}

export function titleOverlap(jobTitle: string, titles: string[]): number {
  const job = significantTokens(jobTitle);
  if (!job.size) return 0;
  let best = 0;
  for (const t of titles) {
    const mine = significantTokens(t);
    const shared = [...job].filter((x) => mine.has(x)).length;
    best = Math.max(best, shared / job.size);
  }
  return best;
}

export function scoreResume(input: AtsInput, jobDescription?: string): AtsReport {
  const normResume = normalizeText(input.text);
  const jd: JobKeywords | null = jobDescription?.trim() ? extractJobKeywords(jobDescription) : null;
  const has = (k: SectionKey) => input.sections.includes(k);

  // ---- Structure (20)
  const structureChecks: Array<Check & { pts: number; ok: boolean }> = [
    { label: "Name detected", pts: 3, ok: Boolean(input.name), status: "pass" },
    { label: "Email address", pts: 3, ok: Boolean(input.contact.email), status: "pass" },
    { label: "Phone number", pts: 2, ok: Boolean(input.contact.phone), status: "pass" },
    { label: "Experience section", pts: 4, ok: has("experience"), status: "pass", detail: has("experience") ? undefined : "Add a section titled “Experience” (or “Projects” if you're just starting out)." },
    { label: "Education section", pts: 3, ok: has("education"), status: "pass" },
    { label: "Skills section", pts: 3, ok: has("skills"), status: "pass" },
    { label: "Standard section headings", pts: 2, ok: input.unusualHeadings.length === 0, status: "pass", detail: input.unusualHeadings.length ? `Rename: ${input.unusualHeadings.join(", ")}` : undefined },
  ].map((c) => ({ ...c, status: (c.ok ? "pass" : "fail") as CheckStatus }));
  if (!has("experience") && has("projects")) {
    // Graduates without jobs yet: projects earn partial experience credit.
    const exp = structureChecks.find((c) => c.label === "Experience section")!;
    exp.ok = true;
    exp.pts = 2;
    exp.status = "warn";
    exp.detail = "No experience section; projects give partial credit.";
  }
  const structure: CategoryScore = {
    id: "structure",
    label: "Structure",
    max: 20,
    applicable: true,
    score: structureChecks.reduce((a, c) => a + (c.ok ? c.pts : 0), 0),
    checks: structureChecks.map(({ label, status, detail }) => ({ label, status, detail })),
  };

  // ---- Formatting (20)
  const symbolCount = (input.text.match(/[☀-➿\u{1F300}-\u{1FAFF}←-⇿■-◿]/gu) ?? []).length;
  const findings = [...input.formatting];
  if (symbolCount > 6) findings.push({ id: "symbols", message: `${symbolCount} decorative symbols or icons found in the text.`, penalty: 2 });
  const formattingScore = Math.max(0, 20 - findings.reduce((a, f) => a + f.penalty, 0));
  const formatting: CategoryScore = {
    id: "formatting",
    label: "Formatting",
    max: 20,
    applicable: true,
    score: formattingScore,
    checks: findings.length
      ? findings.map((f) => ({ label: f.message, status: f.penalty >= 4 ? "fail" : "warn" }))
      : [
          { label: "No text embedded in images", status: "pass" },
          { label: "Simple single-column structure", status: "pass" },
          { label: "Machine-readable text", status: "pass" },
        ],
  };

  // ---- Keywords (25) & Skills (20) & Title (10)
  let keywords: CategoryScore = { id: "keywords", label: "Keywords", max: 25, score: 0, applicable: false, checks: [{ label: "Add a job description to compare keywords.", status: "info" }] };
  let skills: CategoryScore;
  let title: CategoryScore = { id: "title", label: "Job title match", max: 10, score: 0, applicable: false, checks: [{ label: "Add a job description with a job title to compare.", status: "info" }] };
  let match: JobMatch | null = null;

  const resumeSkills = new Set(findSkills(input.text).map((s) => s.name));
  if (jd) {
    const kwTerms = [...new Set([...jd.keywords, ...jd.certifications])];
    const terms = kwTerms.length >= 3 ? kwTerms : [...new Set([...kwTerms, ...jd.skills.map((s) => s.name)])];
    const matchedKeywords = terms.filter((k) => containsPhrase(normResume, k) || resumeSkills.has(k));
    const missingKeywords = terms.filter((k) => !matchedKeywords.includes(k));
    const kwRatio = terms.length ? matchedKeywords.length / terms.length : 1;
    keywords = {
      id: "keywords",
      label: "Keywords",
      max: 25,
      applicable: terms.length > 0,
      score: round1(25 * kwRatio),
      checks: [
        { label: `${matchedKeywords.length} of ${terms.length} job-description keywords found`, status: kwRatio >= 0.75 ? "pass" : kwRatio >= 0.5 ? "warn" : "fail" },
        ...(missingKeywords.length ? [{ label: `Not found: ${missingKeywords.slice(0, 10).join(", ")}`, status: "info" as const, detail: "Only add these if they accurately describe your experience." }] : []),
      ],
    };

    const jdSkills = jd.skills.filter((s) => s.category !== "certification").map((s) => s.name);
    const matchedSkills = jdSkills.filter((s) => resumeSkills.has(s));
    const missingSkills = jdSkills.filter((s) => !resumeSkills.has(s));
    const skRatio = jdSkills.length ? matchedSkills.length / jdSkills.length : 1;
    skills = {
      id: "skills",
      label: "Skills",
      max: 20,
      applicable: true,
      score: jdSkills.length ? round1(20 * skRatio) : Math.min(20, input.listedSkills.length * 2),
      checks: jdSkills.length
        ? [{ label: `${matchedSkills.length} of ${jdSkills.length} required skills found`, status: skRatio >= 0.75 ? "pass" : skRatio >= 0.5 ? "warn" : "fail" }]
        : [{ label: `${input.listedSkills.length} skills listed`, status: input.listedSkills.length >= 8 ? "pass" : "warn" }],
    };

    const overlap = jd.title ? titleOverlap(jd.title, input.titles) : 0;
    if (jd.title) {
      title = {
        id: "title",
        label: "Job title match",
        max: 10,
        applicable: true,
        score: round1(10 * overlap),
        checks: [{ label: overlap >= 0.99 ? `Your title matches “${jd.title}”` : overlap > 0 ? `Partial match with “${jd.title}”` : `No title close to “${jd.title}”`, status: overlap >= 0.99 ? "pass" : overlap > 0 ? "warn" : "fail", detail: overlap < 0.99 ? "If it's accurate, use the posting's wording in your target title or summary." : undefined }],
      };
    }

    const denominator = terms.length + jdSkills.length;
    match = {
      percent: denominator ? Math.round(((matchedKeywords.length + matchedSkills.length) / denominator) * 100) : 0,
      jobTitle: jd.title,
      matchedKeywords,
      missingKeywords,
      matchedSkills,
      missingSkills,
      titleOverlap: overlap,
      yearsRequired: jd.yearsRequired,
      yearsFound: input.experienceYears ?? null,
      educationRequired: jd.education,
    };
  } else {
    skills = {
      id: "skills",
      label: "Skills",
      max: 20,
      applicable: true,
      score: Math.min(20, input.listedSkills.length * 2),
      checks: [{ label: `${input.listedSkills.length} skills listed`, status: input.listedSkills.length >= 10 ? "pass" : input.listedSkills.length >= 5 ? "warn" : "fail", detail: input.listedSkills.length < 10 ? "List the tools and skills you genuinely use (2 points each, up to 10)." : undefined }],
    };
  }

  // ---- Readability (5)
  const bullets = input.bullets.filter((b) => b.trim());
  const verbShare = bullets.length ? bullets.filter((b) => ACTION_VERBS.has((b.trim().replace(/^[-•*·]\s*/, "").match(/^[A-Za-z'-]+/)?.[0] ?? "").toLowerCase())).length / bullets.length : 0;
  const metricShare = bullets.length ? bullets.filter((b) => /\d/.test(b)).length / bullets.length : 0;
  const avgLen = bullets.length ? bullets.reduce((a, b) => a + wordCount(b), 0) / bullets.length : 0;
  const words = wordCount(input.text);
  const readChecks: Array<Check & { pts: number }> = [
    { label: `${Math.round(verbShare * 100)}% of bullets start with an action verb`, pts: verbShare >= 0.6 ? 2 : verbShare >= 0.3 ? 1 : 0, status: verbShare >= 0.6 ? "pass" : "warn" },
    { label: `${Math.round(metricShare * 100)}% of bullets include a measurable result`, pts: metricShare >= 0.3 ? 1.5 : metricShare > 0 ? 0.75 : 0, status: metricShare >= 0.3 ? "pass" : "warn", detail: metricShare < 0.3 ? "Add real numbers where you have them — never estimate figures you can't support." : undefined },
    { label: bullets.length ? `Average bullet length ${Math.round(avgLen)} words` : "No bullet points found", pts: avgLen >= 8 && avgLen <= 30 ? 1 : 0, status: avgLen >= 8 && avgLen <= 30 ? "pass" : "warn" },
    { label: `${words} words`, pts: words >= 250 && words <= 1100 ? 0.5 : 0, status: words >= 250 && words <= 1100 ? "pass" : "warn", detail: words > 1100 ? "Longer than recommended for most roles (1–2 pages)." : words < 250 ? "Quite short — add detail about your experience." : undefined },
  ];
  const readability: CategoryScore = {
    id: "readability",
    label: "Readability",
    max: 5,
    applicable: true,
    score: round1(readChecks.reduce((a, c) => a + c.pts, 0)),
    checks: readChecks.map(({ label, status, detail }) => ({ label, status, detail })),
  };

  const categories = [structure, formatting, keywords, skills, title, readability];
  const applicable = categories.filter((c) => c.applicable);
  const total = Math.round((applicable.reduce((a, c) => a + c.score, 0) / applicable.reduce((a, c) => a + c.max, 0)) * 100);

  const recommendations: string[] = [];
  for (const c of categories) for (const check of c.checks) if ((check.status === "fail" || check.status === "warn") && check.detail) recommendations.push(check.detail);
  for (const c of structure.checks) if (c.status === "fail" && !c.detail) recommendations.push(`Add: ${c.label.toLowerCase()}.`);

  return { total, categories, match, recommendations: [...new Set(recommendations)] };
}
