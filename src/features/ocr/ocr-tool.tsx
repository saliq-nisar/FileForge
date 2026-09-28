"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, FileDown, FileText, Play, RotateCcw, Search } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileList } from "@/components/files/file-list";
import { ProcessingPanel } from "@/components/tools/processing-panel";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/form";
import { Badge, Notice } from "@/components/ui/misc";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useProcessing } from "@/hooks/use-processing";
import { stripExtension } from "@/lib/file/names";
import { getTool } from "@/lib/tools/registry";
import { downloadBlob } from "@/lib/utils/download";
import { toast } from "@/stores/toast-store";
import type { OcrDocumentResult } from "@/services/ocr/pipeline";
import type { OcrEngine } from "@/services/ocr/engine";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function OcrTool() {
  const tool = getTool("ocr")!;
  const rules = useMemo(() => ({ accept: tool.accept, multiple: false }), [tool]);
  const selection = useFileSelection(rules);
  const { state, run, cancel, reset } = useProcessing();
  const [searchable, setSearchable] = useState(true);
  const [ocr, setOcr] = useState<OcrDocumentResult | null>(null);
  const [query, setQuery] = useState("");
  const engineRef = useRef<OcrEngine | null>(null);
  const file = selection.files[0]?.file;

  const fullText = useMemo(
    () => (ocr ? ocr.pages.map((p, i) => (ocr.pages.length > 1 ? `--- Page ${i + 1} ---\n${p.text.trim()}` : p.text.trim())).join("\n\n") : ""),
    [ocr],
  );
  const matches = useMemo(() => (query.trim() ? (fullText.match(new RegExp(escapeRegExp(query.trim()), "gi")) ?? []).length : 0), [fullText, query]);
  const confidence = ocr && ocr.pages.length ? Math.round(ocr.pages.reduce((a, p) => a + p.confidence, 0) / ocr.pages.length) : 0;

  const start = async () => {
    if (!file) return;
    setOcr(null);
    await run(async (ctx) => {
      const [{ TesseractEngine }, { runOcr }] = await Promise.all([import("@/services/ocr/tesseract-engine"), import("@/services/ocr/pipeline")]);
      engineRef.current ??= new TesseractEngine();
      const onAbort = () => {
        void engineRef.current?.terminate();
        engineRef.current = null;
      };
      ctx.signal.addEventListener("abort", onAbort, { once: true });
      const result = await runOcr(file, engineRef.current, { searchablePdf: searchable }, ctx);
      setOcr(result);
      return { files: [] };
    });
  };

  const stem = file ? stripExtension(file.name) : "ocr";

  const downloadDocx = async () => {
    const { Document, Packer, Paragraph, TextRun, PageBreak } = await import("docx");
    const children = (ocr?.pages ?? []).flatMap((p, i, all) => [
      ...p.text.split(/\n{2,}/).map((para) => new Paragraph({ children: [new TextRun(para.replace(/\n/g, " ").trim())], spacing: { after: 160 } })),
      ...(i < all.length - 1 ? [new Paragraph({ children: [new PageBreak()] })] : []),
    ]);
    const blob = await Packer.toBlob(new Document({ creator: "FileForge", sections: [{ children }] }));
    downloadBlob(blob, `${stem}-ocr.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  };

  const highlighted = useMemo(() => {
    const q = query.trim();
    if (!q) return fullText;
    const parts = fullText.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="rounded-sm bg-accent/25 text-fg">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  }, [fullText, query]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {state.phase === "running" ? (
          <ProcessingPanel title="Recognizing text" progress={state.progress} startedAt={state.startedAt} fileNames={file ? [file.name] : []} onCancel={cancel} />
        ) : ocr && state.phase === "done" ? (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Extracted text</h2>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Badge tone={confidence >= 80 ? "success" : confidence >= 60 ? "warning" : "danger"}>{confidence}% confidence</Badge>
                {ocr.pages.length} page{ocr.pages.length === 1 ? "" : "s"}
              </div>
            </div>
            {confidence < 60 && <Notice tone="warning">Recognition confidence is low. A sharper, straight, well-lit scan usually gives much better results.</Notice>}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                <Input aria-label="Search extracted text" placeholder="Search in text" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
              </div>
              {query.trim() && <span className="shrink-0 text-xs text-muted" aria-live="polite">{matches} match{matches === 1 ? "" : "es"}</span>}
            </div>
            <pre className="max-h-[55vh] min-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg-subtle p-4 font-sans text-sm leading-relaxed" tabIndex={0} aria-label="Extracted text">
              {fullText ? highlighted : <span className="text-muted">No text was recognized in this file.</span>}
            </pre>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(fullText).then(() => toast.success("Text copied."), () => toast.error("Couldn't copy."))}>
                Copy text
              </Button>
              <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => downloadBlob(new Blob([fullText], { type: "text/plain;charset=utf-8" }), `${stem}-ocr.txt`)}>
                Download TXT
              </Button>
              <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={() => void downloadDocx()}>
                Download DOCX
              </Button>
              {ocr.pdf && (
                <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={() => downloadBlob(new Blob([ocr.pdf as BlobPart], { type: "application/pdf" }), `${stem}-searchable.pdf`)}>
                  Searchable PDF
                </Button>
              )}
              <Button
                variant="ghost"
                className="sm:ml-auto"
                icon={<RotateCcw className="size-4" />}
                onClick={() => {
                  reset();
                  setOcr(null);
                  selection.clear();
                }}
              >
                Process another file
              </Button>
            </div>
          </div>
        ) : (
          <>
            {state.phase === "error" && <Notice tone="danger" title="OCR failed">{state.message}</Notice>}
            {!file ? (
              <FileDropzone accept={tool.accept} onFiles={(f) => void selection.add(f)} busy={selection.validating} title="Drop a scan, photo or PDF here" />
            ) : (
              <FileList files={selection.files} onRemove={selection.remove} />
            )}
          </>
        )}
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Options</h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Language</span>
              <span className="font-medium">English</span>
            </div>
            <Switch label="Create searchable PDF" description="Keeps the original look and adds an invisible, selectable text layer." checked={searchable} onChange={setSearchable} />
          </div>
          {state.phase !== "done" && (
            <Button size="lg" className="mt-6 w-full" icon={<Play className="size-4" />} disabled={!file || state.phase === "running"} loading={state.phase === "running"} onClick={start}>
              Extract text
            </Button>
          )}
        </div>
        <Notice tone="info">{tool.note}</Notice>
      </aside>
    </div>
  );
}
