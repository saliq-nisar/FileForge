"use client";

import { useState } from "react";
import { ArrowRight, CircleCheck, Copy, Download, Eye, FolderArchive, RotateCcw } from "lucide-react";
import { FilePreview } from "@/components/files/file-preview";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Notice } from "@/components/ui/misc";
import { formatOf } from "@/lib/file/formats";
import { compareSizes, formatBytes } from "@/lib/file/size";
import { downloadAllAsZip, downloadProcessed } from "@/lib/utils/download";
import { toast } from "@/stores/toast-store";
import type { FileKind, ProcessedFile } from "@/types/files";
import type { ProcessResult } from "@/types/processing";

function formatForMime(mime: string) {
  const base = mime.split(";")[0];
  const map: Record<string, FileKind> = {
    "application/pdf": "pdf", "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
    "text/plain": "text", "text/csv": "csv", "text/html": "text",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return formatOf(map[base] ?? "unknown");
}

export function SizeComparison({ original, result }: { original: number; result: number }) {
  const c = compareSizes(original, result);
  return (
    <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface-2 text-center">
      <div className="px-2 py-3">
        <dt className="text-xs text-muted">Original size</dt>
        <dd className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{formatBytes(c.original)}</dd>
      </div>
      <div className="px-2 py-3">
        <dt className="text-xs text-muted">New size</dt>
        <dd className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{formatBytes(c.result)}</dd>
      </div>
      <div className="px-2 py-3">
        <dt className="text-xs text-muted">{c.saved >= 0 ? "Reduction" : "Increase"}</dt>
        <dd className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${c.saved > 0 ? "text-success" : "text-muted"}`}>{Math.abs(c.reductionPercent)}%</dd>
      </div>
    </dl>
  );
}

export function ResultPanel({
  result,
  inputs,
  label,
  showSizes,
  onReset,
  onContinue,
  serverProcessed,
}: {
  result: ProcessResult;
  inputs: File[];
  label: string;
  showSizes: boolean;
  onReset: () => void;
  onContinue?: { label: string; action: (file: ProcessedFile) => void };
  serverProcessed?: boolean;
}) {
  const [preview, setPreview] = useState<ProcessedFile | null>(null);
  const [zipping, setZipping] = useState(false);
  const originalSize = inputs.reduce((a, f) => a + f.size, 0);
  const resultSize = result.files.reduce((a, f) => a + f.size, 0);
  const single = result.files.length === 1 ? result.files[0] : null;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6 animate-fade-in">
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold">Done! Your {label.toLowerCase()} {result.files.length === 1 ? "is" : "are"} ready.</h2>
          <p className="mt-0.5 text-sm text-muted">
            {result.files.length} file{result.files.length === 1 ? "" : "s"} · {formatBytes(resultSize)}
          </p>
        </div>
      </div>

      {result.notes?.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}

      {showSizes && <SizeComparison original={originalSize} result={resultSize} />}

      {result.files.length > 1 && (
        <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {result.files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{formatBytes(f.size)}</span>
              <IconButton size="sm" label={`Preview ${f.name}`} onClick={() => setPreview(f)}>
                <Eye className="size-4" />
              </IconButton>
              <IconButton size="sm" label={`Download ${f.name}`} onClick={() => downloadProcessed(f)}>
                <Download className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {result.text !== undefined && single && single.mime.startsWith("text/plain") && (
        <div className="relative">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-subtle p-3 font-mono text-xs leading-relaxed">{result.text.slice(0, 20000)}</pre>
          <Button
            size="sm"
            variant="secondary"
            className="absolute right-2 top-2"
            icon={<Copy className="size-3.5" />}
            onClick={() => navigator.clipboard.writeText(result.text ?? "").then(() => toast.success("Text copied to clipboard."), () => toast.error("Couldn't copy to the clipboard."))}
          >
            Copy
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {single ? (
          <Button size="lg" icon={<Download className="size-4" />} onClick={() => downloadProcessed(single)}>
            Download {formatForMime(single.mime).kind !== "unknown" ? formatForMime(single.mime).label : "file"}
          </Button>
        ) : (
          <Button
            size="lg"
            loading={zipping}
            icon={<FolderArchive className="size-4" />}
            onClick={async () => {
              setZipping(true);
              try {
                await downloadAllAsZip(result.files, `${label.toLowerCase().replace(/\s+/g, "-")}.zip`);
              } catch {
                toast.error("Couldn't create the ZIP file.");
              } finally {
                setZipping(false);
              }
            }}
          >
            Download all as ZIP
          </Button>
        )}
        {single && (
          <Button size="lg" variant="secondary" icon={<Eye className="size-4" />} onClick={() => setPreview(single)}>
            Preview
          </Button>
        )}
        {onContinue && single && (
          <Button size="lg" variant="secondary" icon={<ArrowRight className="size-4" />} onClick={() => onContinue.action(single)}>
            {onContinue.label}
          </Button>
        )}
        <Button size="lg" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={onReset} className="sm:ml-auto">
          Process another file
        </Button>
      </div>
      <p className="flex items-center gap-2 text-xs text-subtle">
        {serverProcessed ? (
          <>
            <Badge>Server</Badge> Processed on the server; uploaded and processed copies were deleted once your result was retrieved.
          </>
        ) : (
          <>
            <Badge tone="success">Private</Badge> Processed in your browser — your files were not uploaded.
          </>
        )}
      </p>

      <Dialog open={preview !== null} onClose={() => setPreview(null)} title={preview?.name ?? "Preview"} size="lg">
        {preview && <FilePreview file={preview.blob} format={formatForMime(preview.mime)} />}
      </Dialog>
    </div>
  );
}
