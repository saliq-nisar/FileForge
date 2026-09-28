"use client";

import { useEffect, useState } from "react";
import { LoadingState, Notice } from "@/components/ui/misc";
import { formatBytes } from "@/lib/file/size";
import type { FileMetadata, SelectedFile } from "@/types/files";

export function FileInfoPanel({ selected }: { selected: SelectedFile }) {
  const [loaded, setLoaded] = useState<{ id: string; meta: FileMetadata } | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("@/services/file-info")
      .then(({ inspectFile }) => inspectFile(selected.file, selected.format))
      .then((meta) => !cancelled && setLoaded({ id: selected.id, meta }));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const meta = loaded?.id === selected.id ? loaded.meta : null;
  if (!meta) return <LoadingState label="Reading file details…" />;
  const rows: Array<[string, string]> = [
    ["File name", meta.name],
    ["File type", meta.format.label],
    ["Size", `${formatBytes(meta.size)} (${meta.size.toLocaleString()} bytes)`],
    ["MIME type (detected)", meta.format.mime],
    ["MIME type (declared)", meta.declaredMime],
  ];
  if (meta.pageCount) rows.push(["Pages", String(meta.pageCount)]);
  if (meta.width && meta.height) rows.push(["Dimensions", meta.format.kind === "pdf" ? `${meta.width} × ${meta.height} pt` : `${meta.width} × ${meta.height} px`]);
  if (meta.lastModified) rows.push(["Last modified (on device)", new Date(meta.lastModified).toLocaleString()]);
  for (const d of meta.details) rows.push([d.label, d.value]);

  return (
    <div className="flex flex-col gap-3">
      {meta.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}
      <dl className="divide-y divide-border rounded-md border border-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-subtle">The file type is detected from the file&apos;s contents; the declared type comes from your device and isn&apos;t trusted.</p>
    </div>
  );
}
