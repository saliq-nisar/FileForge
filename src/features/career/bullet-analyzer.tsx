"use client";

import { useMemo, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/form";
import { Badge, Notice } from "@/components/ui/misc";
import { analyzeBullet, restructureHint } from "@/lib/ats/bullets";

export function BulletAnalyzer() {
  const [text, setText] = useState("Worked on a website.\nResponsible for managing social media accounts\nReduced checkout errors by 32% by adding server-side validation in Node.js");
  const results = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 50).map((l) => ({ a: analyzeBullet(l), hint: restructureHint(l) })), [text]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <label htmlFor="bullets" className="text-sm font-medium">Paste resume bullets (one per line)</label>
        <Textarea id="bullets" value={text} onChange={(e) => setText(e.target.value)} className="min-h-72 font-mono text-[13px]" />
        <Notice tone="info">Suggestions help you phrase <em>your own</em> facts clearly. Never add achievements, metrics, employers or technologies that aren&apos;t true.</Notice>
      </div>
      <ul className="flex flex-col gap-3" aria-live="polite">
        {results.map(({ a, hint }, i) => (
          <li key={i} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">“{a.text}”</p>
              <Badge tone={a.score >= 80 ? "success" : a.score >= 55 ? "warning" : "danger"}>{a.score}</Badge>
            </div>
            {a.strengths.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                {a.strengths.map((s) => <li key={s} className="flex items-center gap-1.5"><CircleCheck className="size-3.5 text-success" aria-hidden="true" />{s}</li>)}
              </ul>
            )}
            {a.issues.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Problems</p>
                <ul className="mt-1 flex flex-col gap-1.5 text-sm">
                  {a.issues.map((iss) => (
                    <li key={iss.id} className="flex gap-2">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                      <span>{iss.message}<span className="block text-xs text-muted">{iss.suggestion}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hint && <p className="mt-3 rounded-md bg-bg-subtle px-3 py-2 font-mono text-xs">Structure: {hint}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
