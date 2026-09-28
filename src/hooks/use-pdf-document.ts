"use client";

import { useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { toAppError } from "@/lib/errors";

type Source = Blob | Uint8Array;

/** Open a PDF with PDF.js for previews; released automatically on change/unmount. */
export function usePdfDocument(source: Source | null) {
  const [state, setState] = useState<{ source: Source | null; doc: PDFDocumentProxy | null; error: string | null }>({ source: null, doc: null, error: null });

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const { openPdf } = await import("@/services/pdf/pdfjs");
        const data = source instanceof Blob ? await source.arrayBuffer() : source;
        opened = await openPdf(data);
        if (cancelled) {
          void opened.loadingTask.destroy();
          return;
        }
        setState({ source, doc: opened, error: null });
      } catch (error) {
        if (!cancelled) setState({ source, doc: null, error: toAppError(error).userMessage });
      }
    })();
    return () => {
      cancelled = true;
      if (opened) void opened.loadingTask.destroy();
    };
  }, [source]);

  // Results belong to the source they were loaded for; anything else is still loading.
  const current = source !== null && state.source === source;
  return { doc: current ? state.doc : null, error: current ? state.error : null, loading: source !== null && !current };
}

/** Object URL for a blob, revoked on change/unmount. */
export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
