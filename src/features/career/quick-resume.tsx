"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Download, FileText, Pencil } from "lucide-react";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { toast } from "@/stores/toast-store";
import { buildResumeModel } from "@/templates/resumes";
import { analyzeResume } from "./ats";
import { AtsDisclaimer } from "./ats-report-view";
import { AreaField, TextField } from "./resume-forms";
import { newResume, uid, type Resume } from "./resume-model";
import { draftStore } from "./storage";

/**
 * "Create Resume in 5 Minutes": a handful of fields → a structured ATS resume,
 * produced by deterministic formatting (no AI, nothing invented).
 */
export function QuickResume() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", target: "", experience: "", skills: "", education: "" });
  const [done, setDone] = useState<Resume | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const build = (): Resume => {
    const r = newResume(`${f.target || "Resume"} — ${new Date().getFullYear()}`);
    r.contact = { ...r.contact, fullName: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), title: f.target.trim() };
    // Experience: blocks separated by blank lines. First line "Title at Company, 2020–2023", rest are bullets.
    const blocks = f.experience.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    r.experience = blocks.map((b) => {
      const [head, ...rest] = b.split("\n").map((l) => l.trim()).filter(Boolean);
      const years = /((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|now|current)/i.exec(head);
      const clean = head.replace(years?.[0] ?? "", "").replace(/[,|–—-]\s*$/, "").trim();
      const [title, company] = clean.split(/\s+at\s+|\s*[,|@]\s*/);
      const current = years ? /present|now|current/i.test(years[2]) : false;
      return {
        id: uid(),
        title: title?.trim() ?? "",
        company: company?.trim() ?? "",
        location: "",
        start: years ? `${years[1]}-01` : "",
        end: years && !current ? `${years[2]}-01` : "",
        current,
        bullets: rest.length ? rest.map((l) => l.replace(/^[-•*]\s*/, "")) : [""],
      };
    });
    if (!r.experience.length) r.experience = [];
    r.skills = [{ id: uid(), name: "Skills", items: f.skills.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) }];
    r.education = f.education.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const year = /\b(19|20)\d{2}\b/.exec(l)?.[0];
      const [degree, institution] = l.replace(year ?? "", "").replace(/[,|–—-]\s*$/, "").split(/\s*[,|–—]\s*|\s+at\s+/);
      return { id: uid(), degree: degree?.trim() ?? "", institution: institution?.trim() ?? "", location: "", start: "", end: year ? `${year}-06` : "", gpa: "", coursework: "" };
    });
    return r;
  };

  const model = useMemo(() => (done ? buildResumeModel(done) : null), [done]);

  if (done && model) {
    const score = analyzeResume(done).total;
    const dl = async (format: "pdf" | "docx") => {
      setBusy(format);
      try {
        const { downloadDocument } = await import("@/services/documents/export");
        await downloadDocument(model, format, `${done.contact.fullName || "resume"}-resume`.replace(/\s+/g, "-"));
      } catch {
        toast.error("Couldn't create the file.");
      } finally {
        setBusy(null);
      }
    };
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <CircleCheck className="size-6 text-success" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Resume ready</h2>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm">Estimated ATS compatibility: <Badge tone={score >= 85 ? "success" : score >= 70 ? "warning" : "danger"}>{score}/100</Badge></p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <Button icon={<Pencil className="size-4" />} onClick={() => { draftStore.save(done); router.push("/career/resume/new"); }}>Edit resume</Button>
              <Button variant="secondary" icon={<Download className="size-4" />} loading={busy === "pdf"} onClick={() => dl("pdf")}>Download PDF</Button>
              <Button variant="secondary" icon={<FileText className="size-4" />} loading={busy === "docx"} onClick={() => dl("docx")}>Download DOCX</Button>
            </div>
          </div>
          <AtsDisclaimer />
          <Button variant="ghost" className="self-start" onClick={() => setDone(null)}>Back to the form</Button>
        </div>
        <div className="rounded-lg bg-bg-subtle p-3 sm:p-5">
          <DocumentPreview model={model} label="Resume preview" />
        </div>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return toast.error("Enter your name.");
        setDone(build());
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" value={f.name} onChange={set("name")} />
        <TextField label="Target job" value={f.target} onChange={set("target")} placeholder="e.g. Data Analyst" />
        <TextField label="Email" type="email" value={f.email} onChange={set("email")} />
        <TextField label="Phone" type="tel" value={f.phone} onChange={set("phone")} optional />
      </div>
      <AreaField
        label="Experience"
        value={f.experience}
        onChange={set("experience")}
        help="One job per block, separated by an empty line. First line: “Title at Company, 2021 – Present”. Following lines: what you did."
        placeholder={"Frontend Developer at Acme, 2021 – Present\nBuilt the customer dashboard in React\nReduced page load time by 40%\n\nIntern at Beta Corp, 2020 – 2021\nWrote automated tests for the checkout"}
        className="[&_textarea]:min-h-44"
      />
      <AreaField label="Skills" value={f.skills} onChange={set("skills")} placeholder="React, TypeScript, SQL, Communication" help="Comma-separated. List only skills you actually have." />
      <AreaField label="Education" value={f.education} onChange={set("education")} placeholder="B.Sc. Computer Science, University of Somewhere, 2020" help="One per line." optional />
      <Button type="submit" size="lg">Create my resume</Button>
    </form>
  );
}
