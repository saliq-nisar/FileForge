"use client";

import { useMemo } from "react";
import { useStorageVersion } from "@/lib/storage/local";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/stores/toast-store";
import { ScoreBadge } from "./ats-report-view";
import type { Resume } from "./resume-model";
import { analyses, clearAllCareerData, coverLetters, jobDescriptions, resumeRepository, type SavedAnalysis, type SavedCoverLetter, type SavedJobDescription } from "./storage";

export function CareerDashboard() {
  const storageVersion = useStorageVersion();
  const data = useMemo<{ resumes: Resume[]; jds: SavedJobDescription[]; analyses: SavedAnalysis[]; letters: SavedCoverLetter[] } | null>(
    () => (storageVersion === null ? null : { resumes: resumeRepository.list(), jds: jobDescriptions.list(), analyses: analyses.list(), letters: coverLetters.list() }),
    [storageVersion],
  );
  if (!data) return null;

  const stat = (label: string, n: number, href: string) => (
    <Link href={href} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <p className="text-2xl font-semibold tabular-nums">{n}</p>
      <p className="text-sm text-muted">{label}</p>
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("My resumes", data.resumes.length, "/career/resume")}
        {stat("Cover letters", data.letters.length, "/career/cover-letter")}
        {stat("Job descriptions", data.jds.length, "/career/ats")}
        {stat("ATS analyses", data.analyses.length, "/career/ats")}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Recent resumes</h2>
          {data.resumes.length ? (
            <ul className="mt-3 divide-y divide-border">
              {data.resumes.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/career/resume/${r.id}`} className="truncate hover:underline">{r.name}</Link>
                  <span className="shrink-0 text-xs text-muted">{new Date(r.updatedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No saved resumes. <Link href="/career/resume/new" className="text-accent hover:underline">Create one</Link>.</p>
          )}
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Recent ATS analyses</h2>
          {data.analyses.length ? (
            <ul className="mt-3 divide-y divide-border">
              {data.analyses.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{a.resumeName}{a.jobTitle ? ` → ${a.jobTitle}` : ""}</span>
                  <span className="flex shrink-0 items-center gap-2"><ScoreBadge score={a.score} />{a.match !== null && <span className="text-xs text-muted">match {a.match}%</span>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Saved analyses (score summaries only) appear here.</p>
          )}
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Saved job descriptions</h2>
          {data.jds.length ? (
            <ul className="mt-3 divide-y divide-border">
              {data.jds.slice(0, 5).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{j.title}</span>
                  <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => { jobDescriptions.remove(j.id); }}>Delete</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Save job descriptions from the ATS checker to reuse them.</p>
          )}
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Privacy</h2>
          <p className="mt-2 text-sm text-muted">Resume data is sensitive. Nothing here is uploaded: drafts live in this tab only, and versions are kept in this browser only when you choose to save them.</p>
          <Button
            variant="danger"
            size="sm"
            className="mt-4"
            icon={<Trash2 className="size-3.5" />}
            onClick={() => {
              if (!window.confirm("Delete all resumes, cover letters, job descriptions and analyses stored in this browser?")) return;
              clearAllCareerData();
              toast.success("All career data deleted from this browser.");
            }}
          >
            Delete all career data
          </Button>
        </section>
      </div>
    </div>
  );
}
