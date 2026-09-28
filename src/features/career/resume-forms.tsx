"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { analyzeBullet } from "@/lib/ats/bullets";
import { cn } from "@/lib/utils/cn";

/** Editable list of bullet points with inline quality hints. */
export function BulletList({ bullets, onChange, label }: { bullets: string[]; onChange: (b: string[]) => void; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium">{label}</span>
      {bullets.map((b, i) => {
        const a = b.trim() ? analyzeBullet(b) : null;
        const hint = a?.issues[0];
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-start gap-1.5">
              <span className="mt-2.5 text-subtle" aria-hidden="true">•</span>
              <Textarea
                aria-label={`${label} ${i + 1}`}
                value={b}
                rows={2}
                placeholder="Start with an action verb: Built…, Led…, Reduced…"
                onChange={(e) => onChange(bullets.map((x, j) => (j === i ? e.target.value.replace(/\n/g, " ") : x)))}
                className="min-h-0 flex-1"
              />
              <IconButton size="sm" label={`Remove bullet ${i + 1}`} onClick={() => onChange(bullets.length > 1 ? bullets.filter((_, j) => j !== i) : [""])} className="mt-1">
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
            {hint && (
              <p className={cn("ml-4 text-xs", a!.score >= 70 ? "text-muted" : "text-warning")}>
                {hint.message} <span className="text-muted">{hint.suggestion}</span>
              </p>
            )}
          </div>
        );
      })}
      <Button size="sm" variant="ghost" className="self-start" icon={<Plus className="size-3.5" />} onClick={() => onChange([...bullets, ""])}>
        Add bullet
      </Button>
    </div>
  );
}

/** Generic repeatable-entry editor with add/remove/reorder. */
export function EntryList<T extends { id: string }>({
  items,
  onChange,
  create,
  render,
  addLabel,
  title,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  render: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel: string;
  title: (item: T, index: number) => string;
}) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const c = [...items];
    [c[i], c[j]] = [c[j], c[i]];
    onChange(c);
  };
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <fieldset key={item.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <legend className="truncate text-sm font-medium">{title(item, i)}</legend>
            <div className="flex shrink-0">
              <IconButton size="sm" label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></IconButton>
              <IconButton size="sm" label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></IconButton>
              <IconButton size="sm" label="Remove" onClick={() => onChange(items.filter((x) => x.id !== item.id))}><Trash2 className="size-3.5" /></IconButton>
            </div>
          </div>
          {render(item, (patch) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...patch } : x))))}
        </fieldset>
      ))}
      <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => onChange([...items, create()])} className="self-start">
        {addLabel}
      </Button>
    </div>
  );
}

export function TextField({ label, value, onChange, optional, placeholder, type = "text", help, className }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean; placeholder?: string; type?: string; help?: string; className?: string }) {
  return (
    <Field label={label} optional={optional} help={help} className={className}>
      {(p) => <Input {...p} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function AreaField({ label, value, onChange, optional, placeholder, help, className }: { label: string; value: string; onChange: (v: string) => void; optional?: boolean; placeholder?: string; help?: string; className?: string }) {
  return (
    <Field label={label} optional={optional} help={help} className={className}>
      {(p) => <Textarea {...p} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}
