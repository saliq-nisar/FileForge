"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "@/lib/utils/cn";

/**
 * Renders one PDF page to a canvas only when scrolled into view (cheap
 * virtualization for long documents). Re-renders on width/rotation change.
 */
export function PdfPage({
  doc,
  pageNumber,
  width,
  rotation = 0,
  className,
  label,
  eager,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** CSS pixel width. */
  width: number;
  rotation?: number;
  className?: string;
  label?: string;
  eager?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));
  const [aspect, setAspect] = useState<number>(1.294);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (eager || !holder.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "400px" });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible || !holder.current) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const rot = (((page.rotate + rotation) % 360) + 360) % 360;
        const base = page.getViewport({ scale: 1, rotation: rot });
        setAspect(base.height / base.width);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: (width / base.width) * dpr, rotation: rot });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.setAttribute("aria-hidden", "true");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const t = page.render({ canvas, canvasContext: ctx, viewport });
        task = t;
        await t.promise;
        if (cancelled || !holder.current) return;
        holder.current.replaceChildren(canvas);
        setRendered(true);
      } catch {
        /* cancelled render or broken page — placeholder stays */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width, rotation, visible]);

  return (
    <div
      role="img"
      aria-label={label ?? `Page ${pageNumber}`}
      className={cn("relative overflow-hidden bg-white shadow-sm ring-1 ring-black/5", !rendered && "animate-pulse bg-bg-subtle", className)}
      style={{ width, height: width * aspect }}
    >
      <div ref={holder} className="size-full" />
    </div>
  );
}
