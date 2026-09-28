"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, GripVertical, Info, X } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { formatBytes } from "@/lib/file/size";
import { cn } from "@/lib/utils/cn";
import type { SelectedFile } from "@/types/files";
import { FileInfoPanel } from "./file-info-panel";
import { FilePreview, FileThumb } from "./file-preview";

/** Selected files with preview/info, removal and (optional) ordering by drag or keyboard. */
export function FileList({
  files,
  onRemove,
  onReorder,
  orderable,
  disabled,
  statuses,
}: {
  files: SelectedFile[];
  onRemove: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
  orderable?: boolean;
  disabled?: boolean;
  statuses?: Record<string, "pending" | "processing" | "done">;
}) {
  const [inspecting, setInspecting] = useState<{ file: SelectedFile; tab: "preview" | "info" } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <>
      <ol className="flex flex-col gap-2" aria-label="Selected files">
        {files.map((f, i) => (
          <li
            key={f.id}
            draggable={orderable && !disabled}
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && onReorder) onReorder(dragIndex, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-surface p-2.5 pr-2 transition-colors",
              overIndex === i && dragIndex !== i ? "border-accent" : "border-border",
              dragIndex === i && "opacity-50",
            )}
          >
            {orderable && <GripVertical className="hidden size-4 shrink-0 cursor-grab text-subtle sm:block" aria-hidden="true" />}
            <FileThumb file={f.file} format={f.format} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={f.file.name}>
                {orderable && <span className="mr-1.5 text-subtle">{i + 1}.</span>}
                {f.file.name}
              </p>
              <p className="text-xs text-muted">
                {f.format.label} · {formatBytes(f.file.size)}
                {statuses?.[f.id] === "processing" && <span className="ml-2 text-accent">Processing…</span>}
                {statuses?.[f.id] === "done" && <span className="ml-2 text-success">Done</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              {orderable && (
                <>
                  <IconButton size="sm" label={`Move ${f.file.name} up`} disabled={disabled || i === 0} onClick={() => onReorder?.(i, i - 1)}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton size="sm" label={`Move ${f.file.name} down`} disabled={disabled || i === files.length - 1} onClick={() => onReorder?.(i, i + 1)}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                </>
              )}
              <IconButton size="sm" label={`Preview ${f.file.name}`} onClick={() => setInspecting({ file: f, tab: "preview" })}>
                <Eye className="size-4" />
              </IconButton>
              <IconButton size="sm" label={`File information for ${f.file.name}`} className="hidden sm:inline-flex" onClick={() => setInspecting({ file: f, tab: "info" })}>
                <Info className="size-4" />
              </IconButton>
              <IconButton size="sm" label={`Remove ${f.file.name}`} disabled={disabled} onClick={() => onRemove(f.id)}>
                <X className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
      <Dialog open={inspecting !== null} onClose={() => setInspecting(null)} title={inspecting?.file.file.name ?? "File"} size="lg">
        {inspecting && (
          <div className="flex flex-col gap-4">
            <Tabs
              label="File details"
              value={inspecting.tab}
              onChange={(tab) => setInspecting({ ...inspecting, tab })}
              tabs={[
                { value: "preview", label: "Preview" },
                { value: "info", label: "Information" },
              ]}
            />
            {inspecting.tab === "preview" ? <FilePreview file={inspecting.file.file} format={inspecting.file.format} /> : <FileInfoPanel selected={inspecting.file} />}
          </div>
        )}
      </Dialog>
    </>
  );
}
