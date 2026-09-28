"use client";

import { useMemo, useState } from "react";
import { useStorageVersion } from "@/lib/storage/local";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, FilePlus2, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Badge, LoadingState, Notice } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { analyzeBullet } from "@/lib/ats/bullets";
import { detectJobTitle } from "@/lib/ats/keywords";
import { BULLET_LINE } from "@/lib/ats/sections";
import { scoreResume, type AtsReport } from "@/lib/ats/score";
import { toAppError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { analyzeResume, textToAtsInput } from "./ats";
import { AtsReportView } from "./ats-report-view";
import { newResume, type Resume } from "./resume-model";
import { analyses, draftStore, jobDescriptions, resumeRepository } from "./storage";

type Source = "upload" | "paste" | "saved";

export function AtsChecker() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"check" | "job">(params.get("mode") === "job" ? "job" : "check");
  const [jd, setJd] = useState("");
  const [source, setSource] = useState<Source>("upload");
  const [pasted, setPasted] = useState("");
  const storageVersion = useStorageVersion();
  const saved = useMemo<Resume[]>(() => (storageVersion === null ? [] : resumeRepository.list()), [storageVersion]);
  const [pickedId, setSavedId] = useState("");
  const savedId = pickedId || saved[0]?.id || "";
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ report: AtsReport; text: string; name: string } | null>(null);

  const analyze = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (source === "saved") {
        const r = saved.find((x) => x.id === savedId);
        if (!r) throw new Error("no resume");
        const report = analyzeResume(r, jd);
        setResult({ report, text: "", name: r.name });
      } else {
        let text = pasted;
        let formatting: Parameters<typeof textToAtsInput>[1] = [];
        if (source === "upload") {
          if (!file) return toast.error("Upload your resume first.");
          const { extractResume } = await import("./resume-import");
          const ex = await extractResume(file);
          text = ex.text;
          formatting = ex.formatting;
        }
        if (!text.trim()) return toast.error("We couldn't find any text in this resume.");
        setResult({ report: scoreResume(textToAtsInput(text, formatting), jd), text, name: file?.name ?? "Pasted resume" });
      }
    } catch (e) {
      toast.error(toAppError(e).userMessage);
    } finally {
      setBusy(false);
    }
  };

  const generateVersion = async () => {
    if (!result) return;
    let r: Resume;
    if (result.text) {
      const { parseResumeText } = await import("./resume-import");
      r = parseResumeText(result.text);
    } else {
      r = structuredClone(saved.find((x) => x.id === savedId)!);
      r.id = crypto.randomUUID();
    }
    r.jobDescription = jd;
    r.name = `${detectJobTitle(jd) ?? r.contact.title ?? "Tailored resume"} — ${new Date().getFullYear()}`;
    r.template = "classic";
    draftStore.save(r);
    toast.info("Imported into the builder. Please review every section — imports are never perfect.");
    router.push("/career/resume/new");
  };

  const buildFromScratch = () => {
    const r = newResume(`${detectJobTitle(jd) ?? "Tailored resume"} — ${new Date().getFullYear()}`);
    r.jobDescription = jd;
    r.contact.title = detectJobTitle(jd) ?? "";
    draftStore.save(r);
    router.push("/career/resume/new");
  };

  const weakBullets = useMemo(() => {
    if (!result?.text) return [];
    return result.text
      .split("\n")
      .filter((l) => BULLET_LINE.test(l))
      .map((l) => analyzeBullet(l))
      .filter((a) => a.score < 70)
      .slice(0, 6);
  }, [result]);

  const resumeInput = (
    <div className="flex flex-col gap-3">
      <Tabs label="Resume source" value={source} onChange={setSource} tabs={[{ value: "upload", label: "Upload" }, { value: "paste", label: "Paste text" }, ...(saved.length ? [{ value: "saved" as const, label: "My resumes" }] : [])]} />
      {source === "upload" &&
        (file ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <span className="truncate">{file.name}</span>
            <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Change</Button>
          </div>
        ) : (
          <FileDropzone accept={["pdf", "docx", "text"]} onFiles={(f) => setFile(f[0] ?? null)} compact title="Drop your resume (PDF, DOCX or TXT)" enablePaste={false} />
        ))}
      {source === "paste" && <Textarea aria-label="Resume text" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the full text of your resume" className="min-h-48" />}
      {source === "saved" && (
        <Select aria-label="Saved resume" value={savedId} onChange={(e) => setSavedId(e.target.value)}>
          {saved.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      )}
    </div>
  );

  const jdInput = (
    <Field label="Job description" optional={mode === "check"} help="Keywords are extracted from this text only — nothing is invented.">
      {(p) => <Textarea {...p} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description…" className="min-h-44" />}
    </Field>
  );

  return (
    <div className="flex flex-col gap-6">
      <Tabs label="Mode" value={mode} onChange={setMode} tabs={[{ value: "check", label: "Check my resume" }, { value: "job", label: "Create resume for a job" }]} />
      {mode === "job" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">1. Paste the job description</h2>
            {jdInput}
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">2. Start from your resume or from scratch</h2>
            {resumeInput}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button icon={<Sparkles className="size-4" />} disabled={!jd.trim() || busy} loading={busy} onClick={analyze}>Analyze my resume</Button>
              <Button variant="secondary" icon={<FilePlus2 className="size-4" />} disabled={!jd.trim()} onClick={buildFromScratch}>Build from scratch</Button>
            </div>
            {!jd.trim() && <p className="text-xs text-subtle">Paste a job description to continue.</p>}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">Your resume</h2>
            {resumeInput}
          </div>
          <div className="flex flex-col gap-4">
            {jdInput}
            <Button size="lg" icon={<Upload className="size-4" />} loading={busy} onClick={analyze}>Analyze resume</Button>
          </div>
        </div>
      )}

      {busy && <LoadingState label="Analyzing…" />}
      {result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <AtsReportView report={result.report} />
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-sm font-semibold">Make it ATS-friendly</h3>
              <p className="mt-1 text-sm text-muted">Open this resume in the builder with an ATS-safe template. Your content is imported as-is — review it, strengthen bullets and only add skills you really have.</p>
              <Button className="mt-4" icon={<Wand2 className="size-4" />} onClick={generateVersion}>Generate ATS-friendly version</Button>
            </div>
            {weakBullets.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold">Bullets to strengthen</h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {weakBullets.map((b) => (
                    <li key={b.text} className="text-sm">
                      <p className="font-medium">“{b.text}”</p>
                      <p className="mt-0.5 text-xs text-muted">{b.issues.map((i) => i.message).join(" ")}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {jd.trim() && (
                <Button size="sm" variant="secondary" icon={<Bookmark className="size-3.5" />} onClick={() => { jobDescriptions.add({ id: crypto.randomUUID(), title: detectJobTitle(jd) ?? "Job description", text: jd, savedAt: Date.now() }); toast.success("Job description saved on this device."); }}>
                  Save job description
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<Bookmark className="size-3.5" />} onClick={() => { analyses.add({ id: crypto.randomUUID(), resumeName: result.name, jobTitle: result.report.match?.jobTitle ?? null, score: result.report.total, match: result.report.match?.percent ?? null, savedAt: Date.now() }); toast.success("Analysis saved (score summary only)."); }}>
                Save analysis
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setResult(null); setPasted(""); setFile(null); setJd(""); toast.info("Analysis data cleared."); }}>
                Clear analysis data
              </Button>
            </div>
            <Notice tone="info">Your resume is analyzed in your browser and isn&apos;t uploaded or stored unless you choose to save.</Notice>
            {result.report.match && <p className="text-xs text-subtle">Job match {result.report.match.percent}% is based on keywords and skills found in both texts. <Badge>{result.report.match.matchedSkills.length + result.report.match.matchedKeywords.length} matched</Badge></p>}
          </div>
        </div>
      )}
    </div>
  );
}
