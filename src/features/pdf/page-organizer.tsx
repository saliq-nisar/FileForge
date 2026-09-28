"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Download, FilePlus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { PdfPage } from "@/components/files/pdf-page";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorState, LoadingState, Notice } from "@/components/ui/misc";
import { useFileSelection } from "@/hooks/use-file-selection";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { toAppError } from "@/lib/errors";
import { deriveFileName } from "@/lib/file/names";
import { cn } from "@/lib/utils/cn";
import { downloadBlob } from "@/lib/utils/download";
import { toast } from "@/stores/toast-store";

type Item = { key: string; source: number; rotate: number } | { key: string; blank: true; width: number; height: number };

let keySeq = 0;
const newKey = () => `p${++keySeq}`;

export function PageOrganizer() {
  const rules = useMemo(() => ({ accept: ["pdf" as const], multiple: false }), []);
  const selection = useFileSelection(rules);
  const file = selection.files[0]?.file ?? null;
  const { doc, error, loading } = usePdfDocument(file);
  // Edits belong to the document they were made on; a new document starts from its own pages.
  const initialItems = useMemo<Item[]>(() => (doc ? Array.from({ length: doc.numPages }, (_, i) => ({ key: `src-${i}`, source: i, rotate: 0 })) : []), [doc]);
  const [edit, setEdit] = useState<{ doc: typeof doc; items: Item[]; selected: Set<string> }>({ doc: null, items: [], selected: new Set() });
  const items = edit.doc === doc ? edit.items : initialItems;
  const selected = edit.doc === doc ? edit.selected : new Set<string>();
  const setItems = (next: Item[] | ((s: Item[]) => Item[])) => setEdit((e) => ({ doc, selected: e.doc === doc ? e.selected : new Set(), items: typeof next === "function" ? next(e.doc === doc ? e.items : initialItems) : next }));
  const setSelected = (next: Set<string> | ((s: Set<string>) => Set<string>)) => setEdit((e) => ({ doc, items: e.doc === doc ? e.items : initialItems, selected: typeof next === "function" ? next(e.doc === doc ? e.selected : new Set()) : next }));
  const [drag, setDrag] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pageSize, setPageSize] = useState<[number, number]>([595.28, 841.89]);

  useEffect(() => {
    if (!doc) return;
    void doc.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      setPageSize([v.width, v.height]);
    });
  }, [doc]);

  const update = (fn: (items: Item[]) => Item[]) => setItems((s) => fn(s));
  const move = (from: number, to: number) =>
    update((s) => {
      if (to < 0 || to >= s.length) return s;
      const c = [...s];
      const [x] = c.splice(from, 1);
      c.splice(to, 0, x);
      return c;
    });
  const targets = (key: string) => (selected.has(key) && selected.size > 1 ? selected : new Set([key]));
  const rotate = (key: string, d: number) => update((s) => s.map((it) => ("source" in it && targets(key).has(it.key) ? { ...it, rotate: (it.rotate + d + 360) % 360 } : it)));
  const remove = (key: string) => {
    const t = targets(key);
    update((s) => s.filter((it) => !t.has(it.key)));
    setSelected(new Set());
  };
  const duplicate = (i: number) => update((s) => [...s.slice(0, i + 1), { ...s[i], key: newKey() }, ...s.slice(i + 1)]);
  const insertBlank = (i: number) => update((s) => [...s.slice(0, i + 1), { key: newKey(), blank: true, width: pageSize[0], height: pageSize[1] }, ...s.slice(i + 1)]);
  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const save = async () => {
    if (!file || items.length === 0) return;
    setSaving(true);
    try {
      const { applyPagePlan } = await import("@/services/pdf/pages");
      const plan = items.map((it) => ("source" in it ? { source: it.source, rotate: it.rotate } : { blank: true as const, width: it.width, height: it.height }));
      const bytes = await applyPagePlan(new Uint8Array(await file.arrayBuffer()), plan);
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), deriveFileName(file.name, "organized", "pdf"));
      toast.success("PDF saved.");
    } catch (e) {
      toast.error(toAppError(e).userMessage);
    } finally {
      setSaving(false);
    }
  };

  if (!file) return <FileDropzone accept={["pdf"]} onFiles={(f) => void selection.add(f)} busy={selection.validating} />;
  if (loading) return <LoadingState label="Opening PDF…" />;
  if (error) return <ErrorState message={error} action={<Button variant="secondary" onClick={selection.clear}>Choose another file</Button>} />;
  if (!doc) return null;

  const changed = items.length !== doc.numPages || items.some((it, i) => !("source" in it) || it.source !== i || it.rotate !== 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[var(--header-h)] z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:bg-surface">
        <p className="mr-auto text-sm text-muted">
          <span className="font-medium text-fg">{items.length} pages</span>
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setEdit({ doc, items: initialItems, selected: new Set() })} disabled={!changed}>
          Reset
        </Button>
        <Button variant="secondary" size="sm" onClick={selection.clear}>
          Change file
        </Button>
        <Button size="sm" icon={<Download className="size-4" />} loading={saving} disabled={items.length === 0} onClick={save}>
          Save PDF
        </Button>
      </div>
      <Notice tone="info">Drag pages to reorder (or use the arrow buttons). Select several pages to rotate or delete them together.</Notice>
      <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" aria-label="Pages">
        {items.map((it, i) => (
          <li
            key={it.key}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null) move(drag, i);
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-lg border bg-surface p-2 transition-colors",
              selected.has(it.key) ? "border-accent ring-2 ring-accent/20" : "border-border",
              drag === i && "opacity-40",
            )}
          >
            <button type="button" onClick={() => toggle(it.key)} aria-pressed={selected.has(it.key)} aria-label={`Page ${i + 1}${"source" in it ? ` (original page ${it.source + 1})` : " (blank)"} — ${selected.has(it.key) ? "selected" : "select"}`} className="flex h-44 w-full items-center justify-center rounded">
              {"source" in it ? (
                <PdfPage doc={doc} pageNumber={it.source + 1} width={110} rotation={it.rotate} />
              ) : (
                <span className="flex h-40 w-28 items-center justify-center bg-white text-xs text-subtle shadow-sm ring-1 ring-black/5">Blank</span>
              )}
            </button>
            <span className="text-xs font-medium text-muted">{i + 1}</span>
            <div className="flex flex-wrap justify-center">
              <IconButton size="sm" label="Move left" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowLeft className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Rotate left" disabled={!("source" in it)} onClick={() => rotate(it.key, -90)}>
                <RotateCcw className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Rotate right" disabled={!("source" in it)} onClick={() => rotate(it.key, 90)}>
                <RotateCw className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Move right" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowRight className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Duplicate page" onClick={() => duplicate(i)}>
                <Copy className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Insert blank page after" onClick={() => insertBlank(i)}>
                <FilePlus className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Delete page" disabled={items.length <= 1} onClick={() => remove(it.key)} className="hover:text-danger">
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
