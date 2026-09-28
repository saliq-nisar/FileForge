"use client";

import { useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Badge, Notice, ProgressBar } from "@/components/ui/misc";
import type { AtsReport, CheckStatus } from "@/lib/ats/score";
import { cn } from "@/lib/utils/cn";

const ICON: Record<CheckStatus, typeof CircleCheck> = { pass: CircleCheck, warn: TriangleAlert, fail: CircleAlert, info: Info };
const TONE: Record<CheckStatus, string> = { pass: "text-success", warn: "text-warning", fail: "text-danger", info: "text-info" };

export function AtsDisclaimer() {
  return (
    <p className="text-xs leading-relaxed text-muted">
      <strong className="font-medium text-fg">ATS scores are estimates, not guarantees.</strong> Applicant tracking systems differ by employer, software, configuration and job. Use this score to find potential issues — not as a promise that a resume will pass.
    </p>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 85 ? "success" : score >= 70 ? "warning" : "danger";
  return <Badge tone={tone}>{score}/100</Badge>;
}

export function AtsReportView({ report, previous }: { report: AtsReport; previous?: AtsReport | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const applicable = report.categories.filter((c) => c.applicable);
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Estimated ATS compatibility</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-semibold tabular-nums tracking-tight">{report.total}</span>
          <span className="mb-1.5 text-lg text-muted">/ 100</span>
          {previous && previous.total !== report.total && (
            <span className={cn("mb-2 ml-2 text-sm font-medium", report.total > previous.total ? "text-success" : "text-danger")}>
              {report.total > previous.total ? "▲" : "▼"} {Math.abs(report.total - previous.total)}
            </span>
          )}
        </div>
        <ProgressBar value={report.total / 100} label="Estimated ATS compatibility" className="mt-3" />
        <div className="mt-4">
          <AtsDisclaimer />
        </div>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {applicable.map((c) => {
          const prev = previous?.categories.find((p) => p.id === c.id);
          const expanded = open === c.id;
          return (
            <li key={c.id}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle/60">
                <span className="w-28 shrink-0 text-sm font-medium">{c.label}</span>
                <ProgressBar value={c.score / c.max} label={`${c.label} score`} size="sm" className="flex-1" />
                <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {prev && prev.score !== c.score && <span className="mr-1 text-xs text-muted">{prev.score}→</span>}
                  {c.score}/{c.max}
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", expanded && "rotate-180")} aria-hidden="true" />
              </button>
              {expanded && (
                <ul className="flex flex-col gap-2 bg-surface-2 px-4 py-3">
                  {c.checks.map((ch, i) => {
                    const Icon = ICON[ch.status];
                    return (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[ch.status])} aria-label={ch.status} />
                        <span>
                          {ch.label}
                          {ch.detail && <span className="mt-0.5 block text-xs text-muted">{ch.detail}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {report.categories.some((c) => !c.applicable) && <p className="text-xs text-muted">Keyword and job-title checks need a job description and are excluded from the total until you add one.</p>}

      {report.match && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">Job match{report.match.jobTitle ? ` — ${report.match.jobTitle}` : ""}</h3>
            <span className="text-2xl font-semibold tabular-nums">{report.match.percent}%</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Matched keywords</dt><dd className="font-medium">{report.match.matchedKeywords.length} / {report.match.matchedKeywords.length + report.match.missingKeywords.length}</dd></div>
            <div><dt className="text-xs text-muted">Skills matched</dt><dd className="font-medium">{report.match.matchedSkills.length} / {report.match.matchedSkills.length + report.match.missingSkills.length}</dd></div>
            {report.match.yearsRequired !== null && (
              <div><dt className="text-xs text-muted">Experience</dt><dd className="font-medium">{report.match.yearsFound ?? "?"} yrs found · {report.match.yearsRequired}+ asked</dd></div>
            )}
          </dl>
          {report.match.matchedSkills.length + report.match.matchedKeywords.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted">Found in your resume</p>
              <div className="flex flex-wrap gap-1.5">
                {[...report.match.matchedSkills, ...report.match.matchedKeywords].map((k) => <Badge key={`m-${k}`} tone="success">✓ {k}</Badge>)}
              </div>
            </div>
          )}
          {report.match.missingSkills.length + report.match.missingKeywords.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted">Potentially relevant, missing from your resume</p>
              <div className="flex flex-wrap gap-1.5">
                {[...report.match.missingSkills, ...report.match.missingKeywords].map((k) => <Badge key={`x-${k}`}>{k}</Badge>)}
              </div>
              <Notice tone="warning" className="mt-3">Only add these if you genuinely have this experience. Never claim skills, tools or qualifications you don&apos;t have.</Notice>
            </div>
          )}
          {report.match.educationRequired.length > 0 && <p className="mt-3 text-xs text-muted">Education mentioned in the posting: {report.match.educationRequired.join(", ")}.</p>}
        </div>
      )}

      {report.recommendations.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-2 text-sm font-semibold">Suggested improvements</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
            {report.recommendations.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
