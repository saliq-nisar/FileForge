"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Clickable step list with progress. Users can jump back and forth freely. */
export function Stepper({ steps, current, onChange, label }: { steps: string[]; current: number; onChange: (i: number) => void; label: string }) {
  const pct = ((current + 1) / steps.length) * 100;
  return (
    <nav aria-label={label}>
      <p className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>
          Step {current + 1} of {steps.length}
        </span>
        <span className="font-medium text-fg">{steps[current]}</span>
      </p>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <ol className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {steps.map((s, i) => (
          <li key={s} className="shrink-0">
            <button
              type="button"
              onClick={() => onChange(i)}
              aria-current={i === current ? "step" : undefined}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                i === current ? "border-accent bg-accent-soft text-accent" : i < current ? "border-border bg-surface text-fg" : "border-border bg-surface text-muted hover:text-fg",
              )}
            >
              {i < current ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <span className="tabular-nums">{i + 1}</span>}
              {s}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
