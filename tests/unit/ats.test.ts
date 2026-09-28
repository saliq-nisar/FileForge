import { describe, expect, it } from "vitest";
import { analyzeResume, textToAtsInput } from "@/features/career/ats";
import { parseResumeText } from "@/features/career/resume-import";
import { experienceYears, newResume, type Resume } from "@/features/career/resume-model";
import { analyzeBullet, restructureHint } from "@/lib/ats/bullets";
import { detectJobTitle, extractJobKeywords, findSkills } from "@/lib/ats/keywords";
import { containsPhrase, normalizeText } from "@/lib/ats/normalize";
import { detectContact, detectSections } from "@/lib/ats/sections";
import { scoreResume, titleOverlap } from "@/lib/ats/score";

const JD = `Senior Frontend Engineer

We are looking for a developer with 5+ years of experience building web apps.

Requirements:
- Strong React and TypeScript skills
- Experience with REST APIs and GraphQL
- CI/CD pipelines, Docker and AWS
- Accessibility (WCAG) and performance optimization
- Bachelor's degree in Computer Science or equivalent
`;

function sampleResume(): Resume {
  const r = newResume("Frontend");
  r.contact = { ...r.contact, fullName: "Jane Doe", title: "Frontend Engineer", email: "jane@example.com", phone: "+1 555 010 0200" };
  r.summary = "Frontend engineer building accessible web applications.";
  r.experience = [
    { id: "e1", title: "Frontend Engineer", company: "Acme", location: "", start: "2019-01", end: "", current: true, bullets: ["Built a React and TypeScript design system used by 40 engineers", "Reduced page load time by 35% through code splitting"] },
  ];
  r.education = [{ id: "d1", degree: "B.Sc. Computer Science", institution: "State University", location: "", start: "", end: "2018-06", gpa: "", coursework: "" }];
  r.skills = [{ id: "s1", name: "Skills", items: ["React", "TypeScript", "GraphQL", "Jest", "Accessibility"] }];
  return r;
}

describe("text normalization and matching", () => {
  it("matches tech tokens with boundaries", () => {
    const t = normalizeText("Worked with C++, Node.js and CI/CD; used .NET too");
    expect(containsPhrase(t, "c++")).toBe(true);
    expect(containsPhrase(t, "node.js")).toBe(true);
    expect(containsPhrase(t, "ci/cd")).toBe(true);
    expect(containsPhrase(normalizeText("reactive"), "react")).toBe(false);
  });

  it("finds skills via aliases but not ambiguous words in prose", () => {
    const names = findSkills("Built services in golang and k8s. Let's go to the store.").map((s) => s.name);
    expect(names).toContain("Go");
    expect(names).toContain("Kubernetes");
    expect(findSkills("I want to go home").map((s) => s.name)).not.toContain("Go");
  });
});

describe("job description keyword extraction", () => {
  const kw = extractJobKeywords(JD);
  it("extracts title, skills, education and years", () => {
    expect(kw.title).toBe("Senior Frontend Engineer");
    const skills = kw.skills.map((s) => s.name);
    for (const s of ["React", "TypeScript", "REST APIs", "GraphQL", "CI/CD", "Docker", "AWS", "Accessibility", "Performance optimization"]) expect(skills).toContain(s);
    expect(kw.education).toContain("Bachelor's degree");
    expect(kw.yearsRequired).toBe(5);
  });

  it("never invents keywords: everything returned appears in the job description", () => {
    const norm = normalizeText(JD);
    for (const k of kw.keywords) expect(norm.includes(normalizeText(k).replace(/s$/, "")), k).toBe(true);
  });

  it("detects titles from explicit fields and prose", () => {
    expect(detectJobTitle("Job Title: Data Analyst\nWe need…")).toBe("Data Analyst");
    expect(detectJobTitle("We are hiring a senior backend engineer to join us.")).toMatch(/Backend Engineer/i);
  });
});

describe("ATS scoring", () => {
  it("scores a complete builder resume highly without a job description", () => {
    const report = analyzeResume(sampleResume(), "");
    expect(report.total).toBeGreaterThanOrEqual(70);
    expect(report.categories.find((c) => c.id === "keywords")!.applicable).toBe(false);
    expect(report.match).toBeNull();
  });

  it("reports matched and missing skills against a job description", () => {
    const report = analyzeResume(sampleResume(), JD);
    expect(report.match).not.toBeNull();
    expect(report.match!.matchedSkills).toEqual(expect.arrayContaining(["React", "TypeScript", "GraphQL"]));
    expect(report.match!.missingSkills).toEqual(expect.arrayContaining(["Docker", "AWS"]));
    expect(report.categories.every((c) => c.score <= c.max && c.score >= 0)).toBe(true);
  });

  it("changes transparently when a genuine skill is added", () => {
    const r = sampleResume();
    const before = analyzeResume(r, JD).categories.find((c) => c.id === "skills")!.score;
    r.skills[0].items.push("Docker");
    const after = analyzeResume(r, JD).categories.find((c) => c.id === "skills")!.score;
    expect(after).toBeGreaterThan(before);
  });

  it("penalizes formatting problems found in uploaded files", () => {
    const text = "Jane Doe\njane@example.com\nExperience\n- Built things\nEducation\nBSc\nSkills\nReact";
    const clean = scoreResume(textToAtsInput(text, []));
    const messy = scoreResume(textToAtsInput(text, [{ id: "columns", message: "Multi-column layout", penalty: 4 }, { id: "tables", message: "Tables", penalty: 3 }]));
    expect(messy.categories.find((c) => c.id === "formatting")!.score).toBe(13);
    expect(messy.total).toBeLessThan(clean.total);
  });

  it("computes title overlap ignoring seniority words", () => {
    expect(titleOverlap("Senior Frontend Engineer", ["Frontend Engineer"])).toBe(1);
    expect(titleOverlap("Data Scientist", ["Frontend Engineer"])).toBe(0);
  });
});

describe("bullet analyzer", () => {
  it("flags weak, generic bullets and suggests without inventing facts", () => {
    const a = analyzeBullet("Worked on a website.");
    expect(a.issues.map((i) => i.id)).toEqual(expect.arrayContaining(["weak-opener", "no-metric", "too-short"]));
    expect(a.score).toBeLessThan(60);
    expect(restructureHint("Responsible for the billing system")).toBe("[Action verb] billing system");
  });

  it("recognizes strong bullets", () => {
    const a = analyzeBullet("Reduced checkout errors by 32% by adding server-side validation in Node.js");
    expect(a.startsWithActionVerb).toBe(true);
    expect(a.hasMetric).toBe(true);
    expect(a.score).toBeGreaterThanOrEqual(80);
  });
});

describe("resume text parsing and structure detection", () => {
  const text = `Jane Doe
Frontend Engineer
jane@example.com | +1 555 010 0200 | linkedin.com/in/janedoe

Summary
Engineer focused on accessible UIs.

Experience
Frontend Engineer at Acme, Jan 2019 – Present
• Built a design system in React
• Reduced load time by 35%

Education
B.Sc. Computer Science, State University, 2018

Skills
Languages: TypeScript, JavaScript
Frameworks: React, Next.js
`;

  it("detects contact details and standard sections", () => {
    const c = detectContact(text);
    expect(c.email).toBe("jane@example.com");
    expect(c.linkedin).toContain("linkedin.com/in/janedoe");
    expect(detectSections(text).sections.map((s) => s.key)).toEqual(["summary", "experience", "education", "skills"]);
  });

  it("parses text into the structured builder model", () => {
    const r = parseResumeText(text);
    expect(r.contact.fullName).toBe("Jane Doe");
    expect(r.contact.title).toBe("Frontend Engineer");
    expect(r.experience[0]).toMatchObject({ title: "Frontend Engineer", company: "Acme", current: true, start: "2019-01" });
    expect(r.experience[0].bullets).toHaveLength(2);
    expect(r.skills.flatMap((g) => g.items)).toEqual(expect.arrayContaining(["TypeScript", "React", "Next.js"]));
    expect(r.education[0].degree).toBe("B.Sc. Computer Science");
  });

  it("computes years of experience from non-overlapping ranges", () => {
    const r = newResume();
    r.experience = [
      { id: "a", title: "", company: "", location: "", start: "2018-01", end: "2019-12", current: false, bullets: [] },
      { id: "b", title: "", company: "", location: "", start: "2019-06", end: "2020-12", current: false, bullets: [] },
    ];
    expect(experienceYears(r)).toBe(3);
  });
});
