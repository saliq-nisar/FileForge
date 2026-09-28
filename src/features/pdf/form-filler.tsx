"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileList } from "@/components/files/file-list";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { EmptyState, LoadingState, Notice } from "@/components/ui/misc";
import { useFileSelection } from "@/hooks/use-file-selection";
import { toAppError } from "@/lib/errors";
import { deriveFileName } from "@/lib/file/names";
import { downloadBlob } from "@/lib/utils/download";
import { toast } from "@/stores/toast-store";
import type { FormFieldDescriptor, FormValues } from "@/services/pdf/forms";

export function FormFiller() {
  const rules = useMemo(() => ({ accept: ["pdf" as const], multiple: false }), []);
  const selection = useFileSelection(rules);
  const file = selection.files[0]?.file;
  // Fields/errors are tied to the file they were read from.
  const [loaded, setLoaded] = useState<{ file: File; fields: FormFieldDescriptor[] | null; error: string | null } | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const fields = loaded?.file === file ? loaded.fields : null;
  const error = loaded?.file === file ? loaded.error : null;
  const [flatten, setFlatten] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const { readFormFields } = await import("@/services/pdf/forms");
        const f = await readFormFields(new Uint8Array(await file.arrayBuffer()));
        if (cancelled) return;
        setLoaded({ file, fields: f, error: null });
        setValues(Object.fromEntries(f.map((x) => [x.name, x.value])));
      } catch (e) {
        if (!cancelled) setLoaded({ file, fields: null, error: toAppError(e).userMessage });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const { fillForm } = await import("@/services/pdf/forms");
      const bytes = await fillForm(new Uint8Array(await file.arrayBuffer()), values, flatten);
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), deriveFileName(file.name, "filled", "pdf"));
      toast.success("Filled PDF downloaded.");
    } catch (e) {
      toast.error(toAppError(e).userMessage);
    } finally {
      setSaving(false);
    }
  };

  if (!file) return <FileDropzone accept={["pdf"]} onFiles={(f) => void selection.add(f)} busy={selection.validating} title="Drop a fillable PDF here" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <FileList files={selection.files} onRemove={selection.remove} />
        {error && <Notice tone="danger">{error}</Notice>}
        {!fields && !error && <LoadingState label="Reading form fields…" />}
        {fields && fields.length === 0 && (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState title="No fillable fields found" description="This PDF has no interactive form fields. You can still add text anywhere with the PDF editor." action={<Link href="/tools/add-text-to-pdf" className={buttonClasses("secondary")}>Open the editor</Link>} />
          </div>
        )}
        {fields && fields.length > 0 && (
          <form className="grid gap-5 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            {fields.map((f) => {
              const label = f.name.replace(/[._]/g, " ");
              if (f.kind === "checkbox") {
                return <Switch key={f.name} label={label} checked={Boolean(values[f.name])} disabled={f.readOnly} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />;
              }
              if (f.kind === "select" || f.kind === "radio") {
                return (
                  <Field key={f.name} label={label}>
                    {(p) => (
                      <Select {...p} disabled={f.readOnly} value={String(values[f.name] ?? "")} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}>
                        <option value="">—</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                );
              }
              return (
                <Field key={f.name} label={label} className={f.multiline ? "sm:col-span-2" : undefined} help={f.maxLength ? `Up to ${f.maxLength} characters` : undefined}>
                  {(p) =>
                    f.multiline ? (
                      <Textarea {...p} disabled={f.readOnly} maxLength={f.maxLength} value={String(values[f.name] ?? "")} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))} />
                    ) : (
                      <Input {...p} disabled={f.readOnly} maxLength={f.maxLength} value={String(values[f.name] ?? "")} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))} />
                    )
                  }
                </Field>
              );
            })}
          </form>
        )}
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
        <div className="rounded-xl border border-border bg-surface p-5">
          <Switch label="Flatten after filling" description="Makes the answers permanent so they can't be edited." checked={flatten} onChange={setFlatten} />
          <Button size="lg" className="mt-6 w-full" icon={<Download className="size-4" />} loading={saving} disabled={!fields?.length} onClick={save}>
            Save filled PDF
          </Button>
        </div>
      </aside>
    </div>
  );
}
