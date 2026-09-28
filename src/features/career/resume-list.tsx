"use client";

import { useMemo } from "react";
import { useStorageVersion } from "@/lib/storage/local";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, FileText, GitCompare, MoreHorizontal, Pencil, Plus, Target, Trash2, Zap } from "lucide-react";
import { IconButton, buttonClasses } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/stores/toast-store";
import { buildResumeModel } from "@/templates/resumes";
import { analyzeResume } from "./ats";
import { ScoreBadge } from "./ats-report-view";
import type { Resume } from "./resume-model";
import { resumeRepository } from "./storage";

export function ResumeList() {
  const router = useRouter();
  const storageVersion = useStorageVersion();
  const items = useMemo<Resume[] | null>(() => (storageVersion === null ? null : resumeRepository.list()), [storageVersion]);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link href="/career/resume/new" className={buttonClasses()}><Plus className="size-4" aria-hidden="true" />New resume</Link>
      <Link href="/career/resume/quick" className={buttonClasses("secondary")}><Zap className="size-4" aria-hidden="true" />Create resume in 5 minutes</Link>
      <Link href="/career/ats?mode=job" className={buttonClasses("secondary")}><Target className="size-4" aria-hidden="true" />Resume for a job</Link>
    </div>
  );

  if (items === null) return null;
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {actions}
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState icon={<FileText className="size-6" />} title="No saved resumes yet" description="Build a resume and choose “Save” to keep versions here. Resumes are stored only in this browser." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {actions}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((r) => {
          const score = analyzeResume(r).total;
          return (
            <li key={r.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/career/resume/${r.id}`} className="min-w-0">
                  <p className="truncate font-medium hover:underline">{r.name || "Untitled resume"}</p>
                  <p className="truncate text-xs text-muted">{r.contact.title || "No title"} · updated {new Date(r.updatedAt).toLocaleDateString()}</p>
                </Link>
                <Dropdown
                  label={`Actions for ${r.name}`}
                  items={[
                    { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => router.push(`/career/resume/${r.id}`) },
                    {
                      label: "Rename",
                      icon: <Pencil className="size-4" />,
                      onSelect: () => {
                        const name = window.prompt("Rename resume version", r.name);
                        if (name?.trim()) {
                          resumeRepository.save({ ...r, name: name.trim() });
                        }
                      },
                    },
                    {
                      label: "Duplicate",
                      icon: <Copy className="size-4" />,
                      onSelect: () => {
                        resumeRepository.save({ ...structuredClone(r), id: crypto.randomUUID(), name: `${r.name} (copy)`, createdAt: Date.now() });
                        toast.success("Version duplicated.");
                      },
                    },
                    {
                      label: "Download DOCX",
                      icon: <Download className="size-4" />,
                      onSelect: async () => {
                        const { downloadDocument } = await import("@/services/documents/export");
                        await downloadDocument(buildResumeModel(r), "docx", `${r.contact.fullName || "resume"}-resume`);
                      },
                    },
                    { label: "Compare", icon: <GitCompare className="size-4" />, onSelect: () => router.push(`/career/compare?a=${r.id}`) },
                    {
                      label: "Delete",
                      icon: <Trash2 className="size-4" />,
                      danger: true,
                      onSelect: () => {
                        if (!window.confirm(`Delete “${r.name}”? This removes it from this browser permanently.`)) return;
                        resumeRepository.remove(r.id);
                        toast.success("Resume deleted.");
                      },
                    },
                  ]}
                  trigger={(p) => (
                    <IconButton {...p} size="sm" label={`Actions for ${r.name}`}>
                      <MoreHorizontal className="size-4" />
                    </IconButton>
                  )}
                />
              </div>
              <div className="mt-auto flex items-center gap-2 text-xs text-muted">
                <ScoreBadge score={score} /> estimated ATS · {r.template}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
