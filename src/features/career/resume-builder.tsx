"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Download, Eye, EyeOff, FileText, Plus, RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { BuilderLayout } from "@/components/documents/builder-layout";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/form";
import { Badge, Notice } from "@/components/ui/misc";
import { Stepper } from "@/components/ui/stepper";
import { extractJobKeywords, findSkills } from "@/lib/ats/keywords";
import type { AtsReport } from "@/lib/ats/score";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/stores/toast-store";
import { buildResumeModel } from "@/templates/resumes";
import { analyzeResume } from "./ats";
import { AtsDisclaimer, AtsReportView } from "./ats-report-view";
import type { ExportCheckResult } from "./export-check";
import { AreaField, BulletList, EntryList, TextField } from "./resume-forms";
import { allSkills, filledSections, newEducation, newExperience, newProject, newResume, newSimple, RESUME_TEMPLATES, SECTION_LABELS, uid, type Resume, type SimpleItem } from "./resume-model";
import { draftStore, resumeRepository } from "./storage";

const STEPS = ["Job", "Personal info", "Experience", "Education", "Skills", "Projects & more", "Template", "ATS check", "Download"];

function initialState(id: string): { resume: Resume; savedId: string | null; step: number } {
  const saved = id !== "new" ? resumeRepository.get(id) : undefined;
  if (saved) return { resume: saved, savedId: saved.id, step: 1 };
  const draft = draftStore.load();
  return { resume: draft ?? newResume(), savedId: null, step: draft?.jobDescription ? 1 : 0 };
}

export function ResumeBuilder({ id }: { id: string }) {
  const router = useRouter();
  // Client-only component (see resume-builder-client): browser storage is readable here.
  const [initial] = useState(() => initialState(id));
  const [resume, setResume] = useState<Resume>(initial.resume);
  const [savedId, setSavedId] = useState<string | null>(initial.savedId);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(initial.step);
  const [skillInput, setSkillInput] = useState<Record<string, string>>({});
  const [previousReport, setPreviousReport] = useState<AtsReport | null>(null);
  const [check, setCheck] = useState<ExportCheckResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Working copy is kept in sessionStorage only (cleared when the tab closes).
  useEffect(() => {
    if (!savedId) draftStore.save(resume);
  }, [resume, savedId]);

  const model = useMemo(() => buildResumeModel(resume), [resume]);
  const report = useMemo(() => analyzeResume(resume), [resume]);
  const jobDescription = resume.jobDescription;
  const jd = useMemo(() => (jobDescription.trim() ? extractJobKeywords(jobDescription) : null), [jobDescription]);

  const update = (patch: Partial<Resume>) => {
    // Keep the score from before this change so users see what moved it.
    setPreviousReport(report);
    setResume((r) => ({ ...r, ...patch }));
    setDirty(true);
    setCheck(null);
  };
  const contact = (k: keyof Resume["contact"]) => (v: string) => update({ contact: { ...resume.contact, [k]: v } });
  const listed = new Set(allSkills(resume).map((s) => s.toLowerCase()));

  const save = () => {
    const name = resume.name.trim() || `${resume.contact.title || "Resume"} — ${new Date().getFullYear()}`;
    const r = { ...resume, name };
    if (!resumeRepository.save(r)) return toast.error("Couldn't save — browser storage is full or unavailable.");
    setResume(r);
    setSavedId(r.id);
    setDirty(false);
    draftStore.clear();
    toast.success("Saved to My Resumes on this device.");
    if (id === "new") router.replace(`/career/resume/${r.id}`);
  };

  const exportAs = async (format: "pdf" | "docx" | "txt") => {
    setBusy(format);
    try {
      const { downloadDocument } = await import("@/services/documents/export");
      await downloadDocument(model, format, `${resume.contact.fullName || "resume"}-resume`.replace(/\s+/g, "-"));
    } catch {
      toast.error(`Couldn't create the ${format.toUpperCase()} file.`);
    } finally {
      setBusy(null);
    }
  };

  const runCheck = async () => {
    setBusy("check");
    try {
      const { runExportCheck } = await import("./export-check");
      setCheck(await runExportCheck(resume));
    } catch {
      toast.error("The export check couldn't run.");
    } finally {
      setBusy(null);
    }
  };

  const simpleSection = (key: "certifications" | "awards" | "publications" | "volunteer" | "languages", labels: [string, string, string]) => (
    <details className="rounded-lg border border-border bg-surface p-4" open={resume[key].length > 0}>
      <summary className="cursor-pointer text-sm font-semibold">{SECTION_LABELS[key]} <span className="font-normal text-muted">({resume[key].length})</span></summary>
      <div className="mt-4">
        <EntryList<SimpleItem>
          items={resume[key]}
          onChange={(items) => update({ [key]: items } as Partial<Resume>)}
          create={newSimple}
          addLabel={`Add ${SECTION_LABELS[key].toLowerCase().replace(/s$/, "")}`}
          title={(it, i) => it.title || `${SECTION_LABELS[key]} ${i + 1}`}
          render={(it, set) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={labels[0]} value={it.title} onChange={(title) => set({ title })} />
              <TextField label={labels[1]} value={it.subtitle} onChange={(subtitle) => set({ subtitle })} optional />
              <TextField label={labels[2]} value={it.date} onChange={(date) => set({ date })} optional />
              <TextField label="Details" value={it.description} onChange={(description) => set({ description })} optional />
            </div>
          )}
        />
      </div>
    </details>
  );

  const order = resume.sectionOrder;
  const filled = new Set(filledSections(resume));
  const health = [
    { label: "Contact information", ok: Boolean(resume.contact.fullName && (resume.contact.email || resume.contact.phone)) },
    { label: "Professional summary", ok: Boolean(resume.summary.trim()) },
    { label: "Work experience", ok: filled.has("experience") || filled.has("projects") },
    { label: "Education", ok: filled.has("education") },
    { label: "Skills", ok: filled.has("skills") },
    { label: "Standard headings", ok: true },
    { label: "Machine-readable text", ok: true },
  ];
  const warnings = [
    ...(model.blocks.length > 70 ? ["Resume may be longer than two pages — consider trimming older or less relevant content."] : []),
    ...(report.categories.find((c) => c.id === "readability")?.checks.filter((c) => c.status === "warn" && c.label.includes("measurable")).map(() => "Several bullets are missing measurable outcomes.") ?? []),
    ...(report.match && report.match.missingKeywords.length + report.match.missingSkills.length > 0 ? ["Some keywords from the target job are absent (add only if accurate)."] : []),
  ];

  const content = [
    // 0 Job
    <div key="job" className="flex flex-col gap-4">
      <p className="text-sm text-muted">Optional: paste the job description you&apos;re applying for. We&apos;ll compare your resume against it. Nothing is added to your resume automatically.</p>
      <AreaField label="Job description" optional value={resume.jobDescription} onChange={(jobDescription) => update({ jobDescription })} placeholder="Paste the full job posting here…" className="[&_textarea]:min-h-56" />
      {jd && (
        <Notice tone="info" title={jd.title ? `Detected role: ${jd.title}` : "Job description analyzed"}>
          {jd.skills.length} skills and {jd.keywords.length} keywords found{jd.yearsRequired ? ` · ${jd.yearsRequired}+ years of experience mentioned` : ""}.
        </Notice>
      )}
      <TextField label="Version name" value={resume.name} onChange={(name) => update({ name })} placeholder="e.g. Frontend Developer — 2026" help="Helps you tell versions apart in My Resumes." />
    </div>,
    // 1 Personal
    <div key="personal" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" value={resume.contact.fullName} onChange={contact("fullName")} />
        <TextField label="Professional title" value={resume.contact.title} onChange={contact("title")} placeholder={jd?.title ?? "e.g. Software Engineer"} />
        <TextField label="Email" type="email" value={resume.contact.email} onChange={contact("email")} />
        <TextField label="Phone" type="tel" value={resume.contact.phone} onChange={contact("phone")} optional />
        <TextField label="Location" value={resume.contact.location} onChange={contact("location")} optional placeholder="City, Country" help="City and country are enough — no full address needed." />
        <TextField label="LinkedIn" value={resume.contact.linkedin} onChange={contact("linkedin")} optional placeholder="linkedin.com/in/…" />
        <TextField label="GitHub" value={resume.contact.github} onChange={contact("github")} optional />
        <TextField label="Portfolio / website" value={resume.contact.portfolio} onChange={contact("portfolio")} optional />
      </div>
      <AreaField label="Professional summary" value={resume.summary} onChange={(summary) => update({ summary })} optional placeholder="2–3 sentences: who you are, your strongest relevant experience, and what you're looking for." className="[&_textarea]:min-h-28" />
      <p className="text-xs text-subtle">Don&apos;t include a photo, date of birth, marital status or ID numbers — they aren&apos;t needed and may be screened out.</p>
    </div>,
    // 2 Experience
    <EntryList
      key="exp"
      items={resume.experience}
      onChange={(experience) => update({ experience })}
      create={newExperience}
      addLabel="Add experience"
      title={(e, i) => (e.title || e.company ? [e.title, e.company].filter(Boolean).join(" · ") : `Position ${i + 1}`)}
      render={(e, set) => (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Job title" value={e.title} onChange={(title) => set({ title })} />
            <TextField label="Company" value={e.company} onChange={(company) => set({ company })} />
            <TextField label="Location" value={e.location} onChange={(location) => set({ location })} optional />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Start" type="month" value={e.start} onChange={(start) => set({ start })} />
              {!e.current && <TextField label="End" type="month" value={e.end} onChange={(end) => set({ end })} />}
            </div>
          </div>
          <Switch label="I currently work here" checked={e.current} onChange={(current) => set({ current })} />
          <BulletList label="Responsibilities & achievements" bullets={e.bullets} onChange={(bullets) => set({ bullets })} />
        </div>
      )}
    />,
    // 3 Education
    <EntryList
      key="edu"
      items={resume.education}
      onChange={(education) => update({ education })}
      create={newEducation}
      addLabel="Add education"
      title={(e, i) => e.degree || e.institution || `Education ${i + 1}`}
      render={(e, set) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Degree" value={e.degree} onChange={(degree) => set({ degree })} placeholder="B.Sc. Computer Science" />
          <TextField label="Institution" value={e.institution} onChange={(institution) => set({ institution })} />
          <TextField label="Location" value={e.location} onChange={(location) => set({ location })} optional />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Start" type="month" value={e.start} onChange={(start) => set({ start })} optional />
            <TextField label="End" type="month" value={e.end} onChange={(end) => set({ end })} optional />
          </div>
          <TextField label="GPA" value={e.gpa} onChange={(gpa) => set({ gpa })} optional help="Only if it helps (e.g. recent graduates)." />
          <TextField label="Relevant coursework" value={e.coursework} onChange={(coursework) => set({ coursework })} optional />
        </div>
      )}
    />,
    // 4 Skills
    <div key="skills" className="flex flex-col gap-4">
      {resume.skills.map((g) => (
        <fieldset key={g.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Input aria-label="Group name" value={g.name} onChange={(e) => update({ skills: resume.skills.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)) })} className="h-9 max-w-56 font-medium" />
            <IconButton size="sm" label="Remove group" disabled={resume.skills.length === 1} onClick={() => update({ skills: resume.skills.filter((x) => x.id !== g.id) })} className="ml-auto">
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-subtle py-0.5 pl-2.5 pr-1 text-xs">
                {s}
                <button type="button" aria-label={`Remove ${s}`} onClick={() => update({ skills: resume.skills.map((x) => (x.id === g.id ? { ...x, items: x.items.filter((i) => i !== s) } : x)) })} className="rounded-full p-0.5 text-subtle hover:text-fg">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const values = (skillInput[g.id] ?? "").split(",").map((s) => s.trim()).filter((s) => s && !listed.has(s.toLowerCase()));
              if (!values.length) return;
              update({ skills: resume.skills.map((x) => (x.id === g.id ? { ...x, items: [...x.items, ...values] } : x)) });
              setSkillInput((s) => ({ ...s, [g.id]: "" }));
            }}
          >
            <Input aria-label={`Add skills to ${g.name}`} placeholder="Type a skill and press Enter (comma-separate several)" value={skillInput[g.id] ?? ""} onChange={(e) => setSkillInput((s) => ({ ...s, [g.id]: e.target.value }))} />
            <Button type="submit" variant="secondary">Add</Button>
          </form>
        </fieldset>
      ))}
      <Button variant="ghost" className="self-start" icon={<Plus className="size-4" />} onClick={() => update({ skills: [...resume.skills, { id: uid(), name: "Tools", items: [] }] })}>
        Add skill group
      </Button>
      {(() => {
        const text = [resume.summary, ...resume.experience.flatMap((e) => e.bullets), ...resume.projects.flatMap((p) => [p.technologies, ...p.bullets])].join("\n");
        const mentioned = findSkills(text).map((s) => s.name).filter((s) => !listed.has(s.toLowerCase()));
        const fromJd = (jd?.skills ?? []).map((s) => s.name).filter((s) => !listed.has(s.toLowerCase()) && !mentioned.includes(s));
        return (
          <>
            {mentioned.length > 0 && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Skills you mention elsewhere but haven&apos;t listed</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mentioned.map((s) => (
                    <button key={s} type="button" onClick={() => update({ skills: resume.skills.map((x, i) => (i === 0 ? { ...x, items: [...x.items, s] } : x)) })} className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs hover:border-accent hover:text-accent">
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fromJd.length > 0 && (
              <Notice tone="warning" title="Skills from the job description that aren't on your resume">
                <div className="mt-1 flex flex-wrap gap-1.5">{fromJd.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                <p className="mt-2">Only add these if you actually have experience with them. They are shown for reference and are never added for you.</p>
              </Notice>
            )}
          </>
        );
      })()}
    </div>,
    // 5 Projects & more
    <div key="more" className="flex flex-col gap-4">
      <details className="rounded-lg border border-border bg-surface p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">Projects <span className="font-normal text-muted">({resume.projects.length})</span></summary>
        <div className="mt-4">
          <EntryList
            items={resume.projects}
            onChange={(projects) => update({ projects })}
            create={newProject}
            addLabel="Add project"
            title={(p, i) => p.name || `Project ${i + 1}`}
            render={(p, set) => (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Project name" value={p.name} onChange={(name) => set({ name })} />
                  <TextField label="Your role" value={p.role} onChange={(role) => set({ role })} optional />
                  <TextField label="Technologies" value={p.technologies} onChange={(technologies) => set({ technologies })} optional />
                  <TextField label="Project / GitHub URL" value={p.url} onChange={(url) => set({ url })} optional />
                </div>
                <AreaField label="Description" value={p.description} onChange={(description) => set({ description })} optional />
                <BulletList label="Achievements" bullets={p.bullets} onChange={(bullets) => set({ bullets })} />
              </div>
            )}
          />
        </div>
      </details>
      {simpleSection("certifications", ["Certification", "Issuer", "Date"])}
      {simpleSection("awards", ["Award", "Awarded by", "Date"])}
      {simpleSection("publications", ["Title", "Publisher / venue", "Date"])}
      {simpleSection("volunteer", ["Role", "Organization", "Dates"])}
      {simpleSection("languages", ["Language", "Proficiency", "Certificate"])}
      <AreaField label="Interests" optional value={resume.interests} onChange={(interests) => update({ interests })} placeholder="Keep it short and relevant." />
    </div>,
    // 6 Template
    <div key="tpl" className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Template" className="grid gap-2 sm:grid-cols-2">
        {RESUME_TEMPLATES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={resume.template === t.id} onClick={() => update({ template: t.id })} className={cn("rounded-lg border p-3 text-left transition-colors", resume.template === t.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong")}>
            <span className="block text-sm font-medium">{t.name}</span>
            <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-subtle">All templates are single-column, use standard headings and real text — no tables, text boxes, icons or images.</p>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Section order</h3>
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {order.map((k, i) => {
            const hidden = resume.hidden.includes(k);
            return (
              <li key={k} className="flex items-center gap-2 px-3 py-2">
                <span className={cn("flex-1 text-sm", (!filled.has(k) || hidden) && "text-subtle")}>
                  {SECTION_LABELS[k]} {!filled.has(k) && !hidden && <span className="text-xs">(empty)</span>}
                </span>
                <IconButton size="sm" label={hidden ? `Show ${SECTION_LABELS[k]}` : `Hide ${SECTION_LABELS[k]}`} onClick={() => update({ hidden: hidden ? resume.hidden.filter((h) => h !== k) : [...resume.hidden, k] })}>
                  {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </IconButton>
                <IconButton size="sm" label={`Move ${SECTION_LABELS[k]} up`} disabled={i === 0} onClick={() => { const c = [...order]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; update({ sectionOrder: c }); }}>
                  <ArrowUp className="size-3.5" />
                </IconButton>
                <IconButton size="sm" label={`Move ${SECTION_LABELS[k]} down`} disabled={i === order.length - 1} onClick={() => { const c = [...order]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; update({ sectionOrder: c }); }}>
                  <ArrowDown className="size-3.5" />
                </IconButton>
              </li>
            );
          })}
        </ol>
      </div>
    </div>,
    // 7 ATS check
    <AtsReportView key="ats" report={report} previous={previousReport} />,
    // 8 Download
    <div key="dl" className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Resume health check</h3>
          <Badge tone={report.total >= 85 ? "success" : report.total >= 70 ? "warning" : "danger"}>Estimated ATS: {report.total}/100</Badge>
        </div>
        <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {health.map((h) => (
            <li key={h.label} className="flex items-center gap-2">
              {h.ok ? <CircleCheck className="size-4 text-success" aria-label="OK" /> : <CircleAlert className="size-4 text-danger" aria-label="Missing" />}
              {h.label}
            </li>
          ))}
        </ul>
        {warnings.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="text-fg">{w}</span></li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">ATS export check</h3>
            <p className="text-xs text-muted">Generates the PDF, extracts its text and compares it with your content.</p>
          </div>
          <Button size="sm" variant="secondary" loading={busy === "check"} onClick={runCheck}>{check ? "Run again" : "Run check"}</Button>
        </div>
        {check && (
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {check.items.map((i) => (
              <li key={i.label} className="flex items-start gap-2">
                {i.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Passed" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Failed" />}
                <span>{i.label}{i.detail && <span className="block text-xs text-muted">{i.detail}</span>}</span>
              </li>
            ))}
          </ul>
        )}
        {check && check.items.some((i) => !i.ok) && <Notice tone="warning" className="mt-3">Some content didn&apos;t survive export cleanly. Unusual characters may not be supported by the PDF font — the DOCX export is the safest choice for ATS portals.</Notice>}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button size="lg" icon={<FileText className="size-4" />} loading={busy === "docx"} onClick={() => exportAs("docx")}>DOCX</Button>
        <Button size="lg" variant="secondary" icon={<Download className="size-4" />} loading={busy === "pdf"} onClick={() => exportAs("pdf")}>PDF</Button>
        <Button size="lg" variant="secondary" icon={<Download className="size-4" />} loading={busy === "txt"} onClick={() => exportAs("txt")}>TXT</Button>
      </div>
      <p className="text-xs text-subtle">DOCX is the most widely accepted format for ATS portals. The PDF contains real, selectable text — never a flattened image.</p>
      <AtsDisclaimer />
    </div>,
  ];

  return (
    <BuilderLayout
      editor={
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Stepper label="Resume steps" steps={STEPS} current={step} onChange={setStep} />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <span className="text-muted">Estimated ATS</span>
            <Badge tone={report.total >= 85 ? "success" : report.total >= 70 ? "warning" : "danger"}>{report.total}/100</Badge>
            {report.match && <span className="text-muted">· Job match {report.match.percent}%</span>}
            <span className="ml-auto flex items-center gap-2">
              {savedId ? <span className="text-xs text-subtle">{dirty ? "Unsaved changes" : "Saved"}</span> : <span className="text-xs text-subtle">Draft (this tab only)</span>}
              <Button size="sm" variant={savedId && !dirty ? "ghost" : "secondary"} icon={<Save className="size-3.5" />} onClick={save}>Save</Button>
              {!savedId && (
                <IconButton size="sm" label="Start over" onClick={() => { if (window.confirm("Discard this draft and start over?")) { draftStore.clear(); setResume(newResume()); setStep(0); } }}>
                  <RotateCcw className="size-3.5" />
                </IconButton>
              )}
            </span>
          </div>
          <section aria-label={STEPS[step]}>{content[step]}</section>
          <div className="flex justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            <div className="flex gap-2">
              {(step === 5 || step === 0) && <Button variant="ghost" onClick={() => setStep((s) => s + 1)}>Skip</Button>}
              {step < STEPS.length - 1 && <Button onClick={() => setStep((s) => s + 1)}>Continue</Button>}
            </div>
          </div>
        </div>
      }
      preview={<DocumentPreview model={model} label="Resume preview" />}
    />
  );
}
