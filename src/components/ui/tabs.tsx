"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** WAI-ARIA tabs with roving tabindex and arrow-key navigation. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Array<{ value: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const focus = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn("no-scrollbar flex gap-1 overflow-x-auto border-b border-border", className)}>
      {tabs.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${id}-${t.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") focus(i + 1);
              else if (e.key === "ArrowLeft") focus(i - 1);
              else if (e.key === "Home") focus(0);
              else if (e.key === "End") focus(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={cn(
              "relative -mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              selected ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-bg-subtle px-1.5 text-[11px] text-muted">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
