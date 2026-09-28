"use client";

import { useMemo, useState } from "react";
import { Copy, Download, FileText, Plus, Printer, Trash2 } from "lucide-react";
import { BuilderLayout } from "@/components/documents/builder-layout";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { modelToText } from "@/services/documents/model";
import { toast } from "@/stores/toast-store";
import { defaultTemplateValues, getLetterTemplate, type TemplateValues } from "@/templates/letters";

export function TemplateBuilder({ slug }: { slug: string }) {
  const template = getLetterTemplate(slug)!;
  const [values, setValues] = useState<TemplateValues>(() => defaultTemplateValues(template));
  const [busy, setBusy] = useState<string | null>(null);
  const model = useMemo(() => template.build(values), [template, values]);

  const exportAs = async (format: "pdf" | "docx") => {
    setBusy(format);
    try {
      const { downloadDocument } = await import("@/services/documents/export");
      await downloadDocument(model, format, template.name.replace(/\s+/g, "-"));
    } catch {
      toast.error(`Couldn't create the ${format.toUpperCase()} file.`);
    } finally {
      setBusy(null);
    }
  };

  const editor = (
    <div className="flex flex-col gap-5">
      {template.fields.map((f) => {
        if (f.type === "pairs") {
          const rows = (values[f.key] as Array<[string, string]>) ?? [];
          const set = (next: Array<[string, string]>) => setValues((v) => ({ ...v, [f.key]: next }));
          return (
            <fieldset key={f.key} className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium">{f.label}</legend>
              {rows.map(([a, b], i) => (
                <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-2">
                  <Input aria-label={`${f.label} ${i + 1} name`} value={a} onChange={(e) => set(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                  <Input aria-label={`${f.label} ${i + 1} amount`} value={b} inputMode="decimal" onChange={(e) => set(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                  <IconButton label="Remove row" onClick={() => set(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="self-start" icon={<Plus className="size-3.5" />} onClick={() => set([...rows, ["", ""]])}>
                Add row
              </Button>
            </fieldset>
          );
        }
        const value = String(values[f.key] ?? "");
        const onChange = (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.key]: e.target.value }));
        return (
          <Field key={f.key} label={f.label} optional={f.optional}>
            {(p) =>
              f.type === "textarea" ? (
                <Textarea {...p} value={value} placeholder={f.placeholder} onChange={onChange} className="min-h-28" />
              ) : (
                <Input {...p} type={f.type === "date" ? "date" : "text"} value={value} placeholder={f.placeholder} onChange={onChange} />
              )
            }
          </Field>
        );
      })}
      <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
        <Button icon={<Download className="size-4" />} loading={busy === "pdf"} onClick={() => exportAs("pdf")}>Download PDF</Button>
        <Button variant="secondary" icon={<FileText className="size-4" />} loading={busy === "docx"} onClick={() => exportAs("docx")}>Download DOCX</Button>
        <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
        <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(modelToText(model)).then(() => toast.success("Copied as text."), () => toast.error("Couldn't copy."))}>Copy text</Button>
      </div>
      <p className="text-xs text-subtle">Nothing is saved or uploaded — the document is generated in your browser.</p>
    </div>
  );

  return <BuilderLayout editor={editor} preview={<DocumentPreview model={model} />} />;
}
