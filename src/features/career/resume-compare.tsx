"use client";

import { useMemo, useState } from "react";
import { useStorageVersion } from "@/lib/storage/local";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { analyzeResume } from "./ats";
import { ScoreBadge } from "./ats-report-view";
import { allSkills, filledSections, SECTION_LABELS, type Resume } from "./resume-model";
import { resumeRepository } from "./storage";

function Row({ label, a, b }: { label: string; a: boolean; b: boolean }) {
  const diff = a !== b;
  return (
    <tr className={cn(diff && "bg-warning-soft/60")}>
      <td className="px-3 py-1.5">{label}</td>
      <td className={cn("px-3 py-1.5 text-center", a ? "text-success" : "text-subtle")}>{a ? "✓" : "–"}</td>
      <td className={cn("px-3 py-1.5 text-center", b ? "text-success" : "text-subtle")}>{b ? "✓" : "–"}</td>
    </tr>
  );
}

export function ResumeCompare() {
  const params = useSearchParams();
  const storageVersion = useStorageVersion();
  const list = useMemo<Resume[]>(() => (storageVersion === null ? [] : resumeRepository.list()), [storageVersion]);
  const [pickedA, setA] = useState("");
  const [pickedB, setB] = useState("");
  const a = pickedA || params.get("a") || list[0]?.id || "";
  const b = pickedB || list.find((r) => r.id !== a)?.id || "";

  const ra = list.find((r) => r.id === a);
  const rb = list.find((r) => r.id === b);
  const data = useMemo(() => {
    if (!ra || !rb) return null;
    const skills = [...new Set([...allSkills(ra), ...allSkills(rb)])].sort((x, y) => x.localeCompare(y));
    const sa = new Set(allSkills(ra));
    const sb = new Set(allSkills(rb));
    const secA = new Set(filledSections(ra));
    const secB = new Set(filledSections(rb));
    const bulletsA = new Set(ra.experience.flatMap((e) => e.bullets.map((x) => x.trim())).filter(Boolean));
    const bulletsB = new Set(rb.experience.flatMap((e) => e.bullets.map((x) => x.trim())).filter(Boolean));
    return {
      skills: skills.map((s) => ({ s, a: sa.has(s), b: sb.has(s) })),
      sections: (Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>).map((k) => ({ k, a: secA.has(k), b: secB.has(k) })),
      onlyA: [...bulletsA].filter((x) => !bulletsB.has(x)),
      onlyB: [...bulletsB].filter((x) => !bulletsA.has(x)),
      scoreA: analyzeResume(ra).total,
      scoreB: analyzeResume(rb).total,
    };
  }, [ra, rb]);

  if (list.length < 2) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState title="Save at least two resume versions" description="Comparison works between versions saved in My Resumes." action={<Link href="/career/resume" className={buttonClasses()}>Go to My Resumes</Link>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ v: a, set: setA, label: "Version A" }, { v: b, set: setB, label: "Version B" }].map((x) => (
          <label key={x.label} className="flex flex-col gap-1.5 text-sm font-medium">
            {x.label}
            <Select value={x.v} onChange={(e) => x.set(e.target.value)}>
              {list.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </label>
        ))}
      </div>
      {data && ra && rb && (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <p className="flex items-center gap-2">A: <ScoreBadge score={data.scoreA} /> estimated ATS</p>
            <p className="flex items-center gap-2">B: <ScoreBadge score={data.scoreB} /> estimated ATS</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <table className="w-full overflow-hidden rounded-lg border border-border bg-surface text-sm">
              <caption className="px-3 py-2 text-left text-sm font-semibold">Skills</caption>
              <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-1.5 text-left font-medium">Skill</th><th className="px-3 py-1.5 font-medium">A</th><th className="px-3 py-1.5 font-medium">B</th></tr></thead>
              <tbody className="divide-y divide-border">{data.skills.map((x) => <Row key={x.s} label={x.s} a={x.a} b={x.b} />)}</tbody>
            </table>
            <table className="w-full self-start overflow-hidden rounded-lg border border-border bg-surface text-sm">
              <caption className="px-3 py-2 text-left text-sm font-semibold">Sections</caption>
              <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-1.5 text-left font-medium">Section</th><th className="px-3 py-1.5 font-medium">A</th><th className="px-3 py-1.5 font-medium">B</th></tr></thead>
              <tbody className="divide-y divide-border">{data.sections.map((x) => <Row key={x.k} label={SECTION_LABELS[x.k]} a={x.a} b={x.b} />)}</tbody>
            </table>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[{ label: "Experience bullets only in A", items: data.onlyA }, { label: "Experience bullets only in B", items: data.onlyB }].map((x) => (
              <div key={x.label} className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">{x.label}</h3>
                {x.items.length ? <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">{x.items.map((i) => <li key={i}>{i}</li>)}</ul> : <p className="mt-2 text-sm text-muted">None</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
