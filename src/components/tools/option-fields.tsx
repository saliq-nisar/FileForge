"use client";

import { Field, Input, Segmented, Select, Switch, Textarea } from "@/components/ui/form";
import { isFieldVisible, type ToolOptions } from "@/lib/validation/options";
import type { OptionField } from "@/types/tools";

/** Renders a tool's declarative option schema. Adding a tool never needs new form code. */
export function OptionFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: OptionField[];
  values: ToolOptions;
  onChange: (key: string, value: string | number | boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {fields.filter((f) => isFieldVisible(f, values)).map((f) => {
        const v = values[f.key];
        switch (f.type) {
          case "toggle":
            return <Switch key={f.key} label={f.label} description={f.help} checked={Boolean(v)} onChange={(x) => onChange(f.key, x)} disabled={disabled} />;
          case "segmented":
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">{f.label}</span>
                <Segmented label={f.label} value={String(v)} onChange={(x) => onChange(f.key, x)} options={f.choices} />
                {(() => {
                  const hint = f.choices.find((c) => c.value === v)?.hint ?? f.help;
                  return hint ? <p className="text-xs text-subtle">{hint}</p> : null;
                })()}
              </div>
            );
          case "select":
            return (
              <Field key={f.key} label={f.label} help={f.help ?? f.choices.find((c) => c.value === v)?.hint}>
                {(p) => (
                  <Select {...p} value={String(v)} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)}>
                    {f.choices.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            );
          case "range":
            return (
              <Field key={f.key} label={<span className="flex justify-between"><span>{f.label}</span><span className="font-normal tabular-nums text-muted">{String(v)}{f.unit}</span></span>} help={f.help}>
                {(p) => (
                  <input
                    {...p}
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step ?? 1}
                    value={Number(v)}
                    disabled={disabled}
                    onChange={(e) => onChange(f.key, Number(e.target.value))}
                    className="h-5 w-full cursor-pointer accent-[var(--accent)]"
                  />
                )}
              </Field>
            );
          case "number":
            return (
              <Field key={f.key} label={f.label} help={f.help}>
                {(p) => (
                  <div className="relative">
                    <Input
                      {...p}
                      type="number"
                      inputMode="decimal"
                      min={f.min}
                      max={f.max}
                      step={f.step ?? 1}
                      value={Number.isFinite(Number(v)) ? String(v) : ""}
                      disabled={disabled}
                      onChange={(e) => onChange(f.key, e.target.value === "" ? f.min : Number(e.target.value))}
                      className={f.unit ? "pr-12" : undefined}
                    />
                    {f.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">{f.unit}</span>}
                  </div>
                )}
              </Field>
            );
          case "color":
            return (
              <Field key={f.key} label={f.label} help={f.help}>
                {(p) => (
                  <div className="flex items-center gap-2">
                    <input {...p} type="color" value={String(v)} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)} className="h-10 w-12 cursor-pointer rounded-md border border-border bg-surface p-1" />
                    <Input aria-label={`${f.label} hex value`} value={String(v)} disabled={disabled} maxLength={7} onChange={(e) => onChange(f.key, e.target.value)} className="w-28 font-mono" />
                  </div>
                )}
              </Field>
            );
          case "text":
            return (
              <Field key={f.key} label={f.label} help={f.help}>
                {(p) =>
                  f.multiline ? (
                    <Textarea {...p} value={String(v ?? "")} maxLength={f.maxLength} placeholder={f.placeholder} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)} />
                  ) : (
                    <Input
                      {...p}
                      type={f.key.toLowerCase().includes("password") ? "password" : "text"}
                      autoComplete={f.key.toLowerCase().includes("password") ? "new-password" : "off"}
                      value={String(v ?? "")}
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      disabled={disabled}
                      onChange={(e) => onChange(f.key, e.target.value)}
                    />
                  )
                }
              </Field>
            );
          case "pages":
            return (
              <Field key={f.key} label={f.label} help={f.help}>
                {(p) => <Input {...p} value={String(v ?? "")} placeholder={f.placeholder} disabled={disabled} inputMode="numeric" onChange={(e) => onChange(f.key, e.target.value)} />}
              </Field>
            );
        }
      })}
    </div>
  );
}
