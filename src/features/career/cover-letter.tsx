"use client";

import { useMemo, useState } from "react";
import { useStorageVersion } from "@/lib/storage/local";
import { Bookmark, Copy, Download, FileText, Wand2 } from "lucide-react";
import { BuilderLayout } from "@/components/documents/builder-layout";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Button } from "@/components/ui/button";
import { Field, Segmented, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { detectJobTitle, extractJobKeywords, findSkills } from "@/lib/ats/keywords";
import { DEFAULT_THEME, plain, type DocumentModel } from "@/services/documents/model";
import { toast } from "@/stores/toast-store";
import { TextField } from "./resume-forms";
import { allSkills, experienceYears, type Resume } from "./resume-model";
import { coverLetters, resumeRepository } from "./storage";

type Tone = "formal" | "warm" | "concise";

interface Inputs {
  company: string;
  jobTitle: string;
  manager: string;
  jd: string;
  highlights: string;
  tone: Tone;
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Deterministic cover letter generation. Every statement comes from the
 * user's resume, the fields they typed, or the job description's own wording
 * (company/title). Skills are mentioned only if they appear in the resume.
 */
export function generateCoverLetter(resume: Resume | null, v: Inputs): string {
  const title = v.jobTitle.trim() || detectJobTitle(v.jd) || "";
  const role = title ? `the ${title} position` : "the open position";
  const roleShort = title ? `the ${title} role` : "this role";
  const company = v.company.trim() || "your company";
  const years = resume ? experienceYears(resume) : null;
  const resumeSkills = new Set(resume ? [...allSkills(resume), ...findSkills(JSON.stringify(resume.experience)).map((s) => s.name)] : []);
  const jdSkills = v.jd.trim() ? extractJobKeywords(v.jd).skills.map((s) => s.name) : [];
  const shared = jdSkills.filter((s) => resumeSkills.has(s)).slice(0, 5);
  const current = resume?.experience.find((e) => e.current) ?? resume?.experience[0];
  const achievements = (resume?.experience ?? [])
    .flatMap((e) => e.bullets.filter((b) => /\d/.test(b)).map((b) => ({ b: b.trim().replace(/\.$/, ""), e })))
    .slice(0, 2);

  const greeting = v.manager.trim() ? `Dear ${v.manager.trim()},` : "Dear Hiring Manager,";
  const opening = {
    formal: `I am writing to apply for ${role} at ${company}.`,
    warm: `I was excited to see ${role} at ${company} and would love to be considered.`,
    concise: `I'd like to apply for ${roleShort} at ${company}.`,
  }[v.tone];
  const who = resume?.contact.title
    ? ` As a ${resume.contact.title}${years && years >= 1 ? ` with ${Math.floor(years)}+ years of experience` : ""}, I believe my background is a strong fit for this role.`
    : "";

  const paragraphs = [greeting, `${opening}${who}`];
  if (shared.length) paragraphs.push(`My experience with ${listJoin(shared)} aligns closely with what you are looking for.`);
  if (achievements.length) {
    paragraphs.push(
      achievements
        .map(({ b, e }, i) => (i === 0 && e.company ? `At ${e.company}, I ${lowerFirst(b)}.` : `I also ${lowerFirst(b)}.`))
        .join(" "),
    );
  } else if (current?.title) {
    paragraphs.push(`In my ${current.current ? "current" : "most recent"} role as ${current.title}${current.company ? ` at ${current.company}` : ""}, I have built experience that I would bring to ${company}.`);
  }
  if (v.highlights.trim()) paragraphs.push(v.highlights.trim());
  paragraphs.push(
    {
      formal: `I would welcome the opportunity to discuss how I can contribute to ${company}. Thank you for your time and consideration.`,
      warm: `I'd love the chance to talk about how I could help ${company}. Thank you so much for considering my application.`,
      concise: `Thank you for your consideration — I'd be glad to discuss the role further.`,
    }[v.tone],
  );
  const sign = [v.tone === "warm" ? "Warm regards," : "Sincerely,", resume?.contact.fullName ?? "", [resume?.contact.email, resume?.contact.phone].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
  paragraphs.push(sign);
  return paragraphs.join("\n\n");
}

export function CoverLetterBuilder() {
  const storageVersion = useStorageVersion();
  const resumes = useMemo<Resume[]>(() => (storageVersion === null ? [] : resumeRepository.list()), [storageVersion]);
  // null = not chosen yet (defaults to the latest resume); "" = explicitly none.
  const [picked, setResumeId] = useState<string | null>(null);
  const resumeId = picked ?? resumes[0]?.id ?? "";
  const [v, setV] = useState<Inputs>({ company: "", jobTitle: "", manager: "", jd: "", highlights: "", tone: "formal" });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const resume = resumes.find((r) => r.id === resumeId) ?? null;
  const set = (k: keyof Inputs) => (value: string) => setV((s) => ({ ...s, [k]: value }));

  const model: DocumentModel = useMemo(
    () => ({
      title: `Cover letter — ${v.company || "Company"}`,
      author: resume?.contact.fullName,
      pageSize: "letter",
      theme: { ...DEFAULT_THEME, size: 11, margin: 72, lineHeight: 1.45 },
      blocks: [
        ...(resume?.contact.fullName ? [{ type: "paragraph" as const, runs: plain(resume.contact.fullName, { bold: true }), size: 14, spaceAfter: 2 }] : []),
        { type: "paragraph", runs: plain(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })), spaceAfter: 16 },
        ...(body || "Your letter will appear here.").split(/\n{2,}/).map((p) => ({ type: "paragraph" as const, runs: plain(p), spaceAfter: 10 })),
      ],
    }),
    [body, resume, v.company],
  );

  const exportAs = async (format: "pdf" | "docx") => {
    setBusy(format);
    try {
      const { downloadDocument } = await import("@/services/documents/export");
      await downloadDocument(model, format, `cover-letter-${v.company || "draft"}`.replace(/\s+/g, "-"));
    } catch {
      toast.error("Couldn't create the file.");
    } finally {
      setBusy(null);
    }
  };

  const editor = (
    <div className="flex flex-col gap-4">
      <Field label="Resume" help={resumes.length ? "Facts are taken only from this resume." : "Save a resume in the Resume Builder to use it here (optional)."}>
        {(p) => (
          <Select {...p} value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
            <option value="">No resume — use my own highlights</option>
            {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Company" value={v.company} onChange={set("company")} />
        <TextField label="Job title" value={v.jobTitle} onChange={set("jobTitle")} placeholder={detectJobTitle(v.jd) ?? ""} />
        <TextField label="Hiring manager" value={v.manager} onChange={set("manager")} optional />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Tone</span>
          <Segmented label="Tone" value={v.tone} onChange={(tone) => setV((s) => ({ ...s, tone }))} options={[{ value: "formal", label: "Formal" }, { value: "warm", label: "Warm" }, { value: "concise", label: "Concise" }]} />
        </div>
      </div>
      <Field label="Job description" optional>{(p) => <Textarea {...p} value={v.jd} onChange={(e) => set("jd")(e.target.value)} className="min-h-32" />}</Field>
      <Field label="Anything else to mention" optional help="Your own words are included as written.">{(p) => <Textarea {...p} value={v.highlights} onChange={(e) => set("highlights")(e.target.value)} />}</Field>
      <Button icon={<Wand2 className="size-4" />} onClick={() => setBody(generateCoverLetter(resume, v))}>Generate letter</Button>
      {body && (
        <>
          <Field label="Your letter (edit freely)">{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-80 leading-relaxed" />}</Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button icon={<Download className="size-4" />} loading={busy === "pdf"} onClick={() => exportAs("pdf")}>Download PDF</Button>
            <Button variant="secondary" icon={<FileText className="size-4" />} loading={busy === "docx"} onClick={() => exportAs("docx")}>Download DOCX</Button>
            <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(body).then(() => toast.success("Copied to clipboard."), () => toast.error("Couldn't copy."))}>Copy to clipboard</Button>
            <Button variant="secondary" icon={<Bookmark className="size-4" />} onClick={() => { coverLetters.add({ id: crypto.randomUUID(), company: v.company, jobTitle: v.jobTitle || detectJobTitle(v.jd) || "", body, savedAt: Date.now() }); toast.success("Saved on this device."); }}>Save</Button>
          </div>
        </>
      )}
      <Notice tone="info">The letter is assembled from your resume and inputs only. Review it and make sure every statement is accurate.</Notice>
    </div>
  );
  return <BuilderLayout editor={editor} preview={<DocumentPreview model={model} label="Cover letter preview" />} />;
}
