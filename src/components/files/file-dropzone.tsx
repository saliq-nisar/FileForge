"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FilePlus2, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptAttribute, describeKinds } from "@/lib/file/formats";
import { formatBytes } from "@/lib/file/size";
import { cn } from "@/lib/utils/cn";
import type { FileKind } from "@/types/files";

/**
 * Drag & drop + click + paste upload area. Only collects files; validation
 * happens in useFileSelection so every entry point is checked the same way.
 */
export function FileDropzone({
  accept,
  multiple,
  onFiles,
  maxBytes,
  busy,
  compact,
  title,
  enablePaste = true,
}: {
  accept: FileKind[];
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  maxBytes?: number;
  busy?: boolean;
  compact?: boolean;
  title?: string;
  enablePaste?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hintId = useId();
  const label = describeKinds(accept);
  const noun = accept.length === 1 && accept[0] === "pdf" ? "PDF" : accept.every((k) => ["jpeg", "png", "webp", "avif", "gif", "bmp", "tiff"].includes(k)) ? (multiple ? "images" : "image") : multiple ? "files" : "file";

  useEffect(() => {
    if (!enablePaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
      const pasted = Array.from(e.clipboardData?.files ?? []);
      if (pasted.length) {
        e.preventDefault();
        onFiles(pasted);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enablePaste, onFiles]);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (!busy) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors duration-150",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12 sm:py-16",
        dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:border-accent/60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={acceptAttribute(accept)}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <span className={cn("flex items-center justify-center rounded-full transition-colors", compact ? "size-10" : "size-14", dragging ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent")}>
        {busy ? <LoaderCircle className="size-6 animate-spin" aria-hidden="true" /> : dragging ? <FilePlus2 className="size-6" aria-hidden="true" /> : <Upload className="size-6" aria-hidden="true" />}
      </span>
      <div>
        <p className={cn("font-semibold", compact ? "text-sm" : "text-lg")}>{busy ? "Checking files…" : dragging ? "Release to add" : (title ?? `Drop your ${noun} here`)}</p>
        {!compact && <p className="mt-1 text-sm text-muted">or</p>}
      </div>
      <Button onClick={() => inputRef.current?.click()} disabled={busy} size={compact ? "sm" : "lg"} aria-describedby={hintId}>
        {multiple ? "Choose files" : "Choose file"}
      </Button>
      <p id={hintId} className="text-xs text-subtle">
        {label}
        {maxBytes ? ` · up to ${formatBytes(maxBytes)}` : ""}
        {enablePaste && !compact ? " · you can also paste" : ""}
      </p>
    </div>
  );
}
