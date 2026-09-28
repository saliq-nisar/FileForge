"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import type { ProcessingProgress } from "@/types/processing";

function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** Reusable progress view: title, bar, current operation, ETA, per-file status and cancel. */
export function ProcessingPanel({
  title,
  progress,
  startedAt,
  fileNames,
  onCancel,
}: {
  title: string;
  progress: ProcessingProgress;
  startedAt: number;
  fileNames: string[];
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ratio = progress.ratio;
  const elapsed = now - startedAt;
  const eta = ratio && ratio > 0.05 && elapsed > 2000 ? (elapsed * (1 - ratio)) / ratio : null;
  const pct = ratio === undefined ? null : Math.round(ratio * 100);
  const multi = fileNames.length > 1;
  const currentIndex = multi && progress.step ? progress.step - 1 : -1;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 sm:p-6" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {pct !== null && <span className="text-sm font-medium tabular-nums text-muted">{pct}%</span>}
      </div>
      <ProgressBar value={ratio} label={title} className="mt-4" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <p className="min-w-0 truncate">
          {progress.message}
          {progress.step && progress.totalSteps && !multi ? ` (${progress.step} of ${progress.totalSteps})` : ""}
        </p>
        {eta !== null && <p className="shrink-0 text-xs">About {formatDuration(eta)} left</p>}
      </div>
      {multi && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-subtle">{fileNames.length} files selected</p>
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto text-sm">
            {fileNames.map((name, i) => {
              const done = currentIndex > i;
              const active = currentIndex === i;
              return (
                <li key={`${name}-${i}`} className="flex items-center gap-2">
                  {done ? (
                    <Check className="size-4 shrink-0 text-success" aria-label="Done" />
                  ) : active ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-accent" aria-label="Processing" />
                  ) : (
                    <span className="size-4 shrink-0 rounded-full border border-border-strong" aria-label="Waiting" />
                  )}
                  <span className={cn("truncate", !done && !active && "text-muted")}>{name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
