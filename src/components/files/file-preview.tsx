"use client";

import { useEffect, useState } from "react";
import { FileText, FileWarning } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/ui/misc";
import { usePdfDocument, useObjectUrl } from "@/hooks/use-pdf-document";
import type { DetectedFormat } from "@/types/files";
import { PdfPage } from "./pdf-page";

/** Small thumbnail used in file lists. */
export function FileThumb({ file, format, size = 48 }: { file: Blob; format: DetectedFormat; size?: number }) {
  if (format.kind === "pdf") return <PdfThumb file={file} size={size} />;
  if (format.family === "image" && format.kind !== "tiff") return <ImageThumb file={file} size={size} />;
  return (
    <span className="flex shrink-0 items-center justify-center rounded border border-border bg-bg-subtle text-muted" style={{ width: size, height: size }}>
      <FileText className="size-5" aria-hidden="true" />
    </span>
  );
}

function ImageThumb({ file, size }: { file: Blob; size: number }) {
  const url = useObjectUrl(file);
  return (
    <span className="block shrink-0 overflow-hidden rounded border border-border bg-bg-subtle" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not optimizable */}
      {url && <img src={url} alt="" className="size-full object-cover" decoding="async" />}
    </span>
  );
}

function PdfThumb({ file, size }: { file: Blob; size: number }) {
  const { doc } = usePdfDocument(file);
  return (
    <span className="flex shrink-0 items-start justify-center overflow-hidden rounded border border-border bg-bg-subtle" style={{ width: size, height: size }}>
      {doc && <PdfPage doc={doc} pageNumber={1} width={size * 0.78} eager label="First page" className="mt-1" />}
    </span>
  );
}

/** Full preview for supported formats; honest message for the rest. */
export function FilePreview({ file, format, maxPages = 50 }: { file: Blob; format: DetectedFormat; maxPages?: number }) {
  if (format.kind === "pdf") return <PdfPreview file={file} maxPages={maxPages} />;
  if (format.family === "image") return <ImagePreview file={file} tiff={format.kind === "tiff"} />;
  if (format.family === "text") return <TextPreview file={file} />;
  if (format.kind === "docx") return <DocxPreview file={file} />;
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
      <FileWarning className="size-6" aria-hidden="true" />
      Preview isn&apos;t available for {format.label} files in the browser.
    </div>
  );
}

function PdfPreview({ file, maxPages }: { file: Blob; maxPages: number }) {
  const { doc, error, loading } = usePdfDocument(file);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const update = () => setWidth(Math.min(560, window.innerWidth - 80));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  if (loading) return <LoadingState label="Opening PDF…" />;
  if (error) return <ErrorState title="Can't preview this PDF" message={error} />;
  if (!doc) return null;
  const pages = Math.min(doc.numPages, maxPages);
  return (
    <div className="flex flex-col items-center gap-4">
      {Array.from({ length: pages }, (_, i) => (
        <figure key={i} className="flex flex-col items-center gap-1.5">
          <PdfPage doc={doc} pageNumber={i + 1} width={width} />
          <figcaption className="text-xs text-subtle">
            Page {i + 1} of {doc.numPages}
          </figcaption>
        </figure>
      ))}
      {doc.numPages > pages && <p className="text-xs text-subtle">Preview limited to the first {pages} pages.</p>}
    </div>
  );
}

function ImagePreview({ file, tiff }: { file: Blob; tiff: boolean }) {
  const url = useObjectUrl(tiff ? null : file);
  const [failed, setFailed] = useState(false);
  if (tiff || failed) {
    return <p className="py-10 text-center text-sm text-muted">Your browser can&apos;t display this image format, but it can still be processed where supported.</p>;
  }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img src={url} alt="Preview" onError={() => setFailed(true)} className="mx-auto max-h-[70vh] w-auto max-w-full rounded border border-border bg-[repeating-conic-gradient(var(--bg-subtle)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] object-contain" />
  ) : null;
}

function TextPreview({ file }: { file: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.slice(0, 100_000).text().then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (text === null) return <LoadingState />;
  return (
    <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg-subtle p-4 font-mono text-xs leading-relaxed">
      {text}
      {file.size > 100_000 && "\n\n… (preview truncated)"}
    </pre>
  );
}

function DocxPreview({ file }: { file: Blob }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = (await import("mammoth")) as unknown as { default?: { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }; convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
        const m = mod.default ?? mod;
        const { value } = await m.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        if (!cancelled) setHtml(value);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (error) return <ErrorState title="Can't preview this document" message="This Word document couldn't be read." />;
  if (html === null) return <LoadingState label="Opening document…" />;
  // Sandboxed iframe without scripts: document HTML can never run code in our page.
  const doc = `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 system-ui,sans-serif;margin:24px;color:#1a1a1a}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px}</style>${html}`;
  return <iframe title="Document preview" sandbox="" srcDoc={doc} className="h-[70vh] w-full rounded-md border border-border bg-white" />;
}
