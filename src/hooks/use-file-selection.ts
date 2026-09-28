"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectFormat } from "@/lib/file/detect";
import { sanitizeFileName } from "@/lib/file/names";
import { validateDetectedFile, validateSelectionCount, validateTotalSize, type FileRules } from "@/lib/validation/files";
import type { SelectedFile } from "@/types/files";
import { toast } from "@/stores/toast-store";

export interface FileSelection {
  files: SelectedFile[];
  validating: boolean;
  add: (incoming: FileList | File[]) => Promise<void>;
  remove: (id: string) => void;
  move: (id: string, delta: number) => void;
  reorder: (from: number, to: number) => void;
  clear: () => void;
}

/** Validates files by content (magic bytes) before they can be processed. */
export function useFileSelection(rules: FileRules & { multiple?: boolean }): FileSelection {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [validating, setValidating] = useState(false);
  // Latest selection for async validation callbacks.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const add = useCallback(
    async (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      if (!list.length) return;
      const max = rules.multiple ? (rules.maxFiles ?? 100) : 1;
      const current = rules.multiple ? filesRef.current : [];
      const countError = validateSelectionCount(current.length, list.length, max);
      if (countError && !(max === 1 && list.length === 1)) {
        toast.error(countError);
        if (max === 1) return;
      }
      setValidating(true);
      const accepted: SelectedFile[] = [];
      const room = Math.max(0, max - current.length);
      for (const file of list.slice(0, max === 1 ? 1 : room)) {
        const name = sanitizeFileName(file.name);
        try {
          const format = await detectFormat(file);
          const { error, warning } = validateDetectedFile(file, format, rules);
          if (error) {
            toast.error(`${name}: ${error}`);
            continue;
          }
          if (warning) toast.warning(`${name}: ${warning}`);
          accepted.push({ id: crypto.randomUUID(), file, format });
        } catch {
          toast.error(`${name}: We couldn't read this file.`);
        }
      }
      setValidating(false);
      if (!accepted.length) return;
      const next = rules.multiple ? [...filesRef.current, ...accepted] : accepted.slice(0, 1);
      const totalError = validateTotalSize(next.map((f) => f.file.size));
      if (totalError) {
        toast.error(totalError);
        return;
      }
      filesRef.current = next;
      setFiles(next);
    },
    [rules],
  );

  const remove = useCallback((id: string) => setFiles((f) => f.filter((x) => x.id !== id)), []);
  const reorder = useCallback((from: number, to: number) => {
    setFiles((f) => {
      if (to < 0 || to >= f.length) return f;
      const copy = [...f];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);
  const move = useCallback((id: string, delta: number) => {
    const i = filesRef.current.findIndex((f) => f.id === id);
    if (i >= 0) reorder(i, i + delta);
  }, [reorder]);
  const clear = useCallback(() => setFiles([]), []);

  return { files, validating, add, remove, move, reorder, clear };
}
