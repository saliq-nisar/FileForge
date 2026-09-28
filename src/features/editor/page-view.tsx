"use client";

import { useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPage as PdfPageCanvas } from "@/components/files/pdf-page";
import { ElementView } from "./element-view";
import { addElement, boundsOf, resizeElement, simplify, translateElement, updateElement, type EditorAction } from "./state";
import { visualDims, type EditorElement, type EditorTool, type PdfPage } from "./types";

export interface ToolStyle {
  color: string;
  strokeWidth: number;
  highlight: string;
  fontSize: number;
  stamp: string;
}

type Draft = { tool: EditorTool; start: [number, number]; points: [number, number][] } | null;

const DRAG_TOOLS: EditorTool[] = ["draw", "highlight", "underline", "strike", "rect", "ellipse", "line", "arrow", "whiteout"];

export function newId(): string {
  return crypto.randomUUID();
}

export function PageView({
  page,
  index,
  doc,
  scale,
  elements,
  tool,
  style,
  selectedId,
  editingId,
  dispatch,
  onSelect,
  onEdit,
  onToolDone,
  onRequestPlacement,
}: {
  page: PdfPage;
  index: number;
  doc: PDFDocumentProxy | null;
  scale: number;
  elements: EditorElement[];
  tool: EditorTool;
  style: ToolStyle;
  selectedId: string | null;
  editingId: string | null;
  dispatch: Dispatch<EditorAction>;
  onSelect: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onToolDone: () => void;
  /** For tools that need extra input first (image, signature): page + point. */
  onRequestPlacement: (pageKey: string, x: number, y: number) => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; start: [number, number]; orig: EditorElement } | null>(null);
  const { width, height } = visualDims(page);

  const toPage = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = overlay.current!.getBoundingClientRect();
    return [Math.min(width, Math.max(0, (e.clientX - r.left) / scale)), Math.min(height, Math.max(0, (e.clientY - r.top) / scale))];
  };

  const create = (el: EditorElement, edit = false) => {
    dispatch({ type: "commit", update: addElement(el) });
    onSelect(el.id);
    if (edit) onEdit(el.id);
    onToolDone();
  };

  const base = { pageKey: page.key, rotation: 0, opacity: 1 };

  const onOverlayDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = toPage(e);
    if (tool === "select") {
      onSelect(null);
      onEdit(null);
      return;
    }
    if (DRAG_TOOLS.includes(tool)) {
      overlay.current?.setPointerCapture(e.pointerId);
      setDraft({ tool, start: [x, y], points: [[x, y]] });
      return;
    }
    if (tool === "text") {
      create({ ...base, id: newId(), type: "text", x, y: y - style.fontSize * 0.6, w: Math.min(260, width - x), h: style.fontSize * 1.4, text: "", font: "sans", fontSize: style.fontSize, bold: false, italic: false, color: style.color, align: "left", lineHeight: 1.3 }, true);
    } else if (tool === "comment") {
      create({ ...base, id: newId(), type: "comment", x, y, w: 20, h: 20, text: "", color: "#facc15" });
    } else if (tool === "stamp") {
      const w = Math.max(120, style.stamp.length * 13);
      create({ ...base, id: newId(), type: "stamp", x: x - w / 2, y: y - 22, w, h: 44, text: style.stamp, color: style.color === "#111111" ? "#c2410c" : style.color });
    } else if (tool === "image" || tool === "signature") {
      onRequestPlacement(page.key, x, y);
    }
  };

  const onOverlayMove = (e: ReactPointerEvent) => {
    if (!draft) return;
    const p = toPage(e);
    setDraft((d) => (d ? { ...d, points: d.tool === "draw" ? [...d.points, p] : [d.start, p] } : d));
  };

  const onOverlayUp = () => {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    const end = d.points[d.points.length - 1];
    const b = boundsOf([d.start, end]);
    if (d.tool === "draw") {
      if (d.points.length < 2) return;
      const pts = simplify(d.points);
      create({ ...base, id: newId(), type: "ink", ...boundsOf(pts, 0), points: pts, stroke: style.color, strokeWidth: style.strokeWidth });
      return;
    }
    if (b.w < 3 && b.h < 3) return; // treat as a click, not a drag
    if (d.tool === "line" || d.tool === "arrow") {
      create({ ...base, id: newId(), type: d.tool, ...b, points: [d.start, end], stroke: style.color, strokeWidth: style.strokeWidth });
    } else if (d.tool === "rect" || d.tool === "ellipse") {
      create({ ...base, id: newId(), type: d.tool, ...b, stroke: style.color, strokeWidth: style.strokeWidth, fill: null });
    } else if (d.tool === "whiteout") {
      create({ ...base, id: newId(), type: "whiteout", ...b, stroke: "#ffffff", strokeWidth: 0, fill: "#ffffff" });
    } else if (d.tool === "highlight" || d.tool === "underline" || d.tool === "strike") {
      create({ ...base, id: newId(), type: d.tool, ...b, h: Math.max(b.h, 8), color: d.tool === "highlight" ? style.highlight : style.color });
    }
  };

  const startDrag = (el: EditorElement, mode: "move" | "resize") => (e: ReactPointerEvent) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    onSelect(el.id);
    if (editingId === el.id) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dispatch({ type: "checkpoint" });
    drag.current = { id: el.id, mode, start: toPage(e), orig: el };
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const [x, y] = toPage(ev);
      const dx = x - g.start[0];
      const dy = y - g.start[1];
      const patch = g.mode === "move" ? translateElement(g.orig, dx, dy) : resizeElement(g.orig, g.orig.w + dx, g.orig.h + dy);
      dispatch({ type: "transient", update: updateElement(g.id, patch) });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const draftPreview = (() => {
    if (!draft) return null;
    const end = draft.points[draft.points.length - 1];
    if (draft.tool === "draw" || draft.tool === "line" || draft.tool === "arrow") {
      return (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <polyline points={draft.points.map(([x, y]) => `${x * scale},${y * scale}`).join(" ")} fill="none" stroke={style.color} strokeWidth={style.strokeWidth * scale} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    const b = boundsOf([draft.start, end]);
    return (
      <div
        className="pointer-events-none absolute border border-dashed border-accent"
        style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale, background: draft.tool === "highlight" ? `${style.highlight}66` : draft.tool === "whiteout" ? "#fff" : undefined }}
      />
    );
  })();

  const drawing = tool !== "select";

  return (
    <div className="relative mx-auto bg-white shadow-md ring-1 ring-black/5" style={{ width: width * scale, height: height * scale }} data-page-index={index}>
      {page.source !== null && doc ? (
        <PdfPageCanvas doc={doc} pageNumber={page.source + 1} width={width * scale} rotation={page.rotate} label={`Page ${index + 1}`} className="shadow-none! ring-0!" />
      ) : (
        <div role="img" aria-label={`Page ${index + 1} (blank)`} className="size-full" />
      )}
      <div
        ref={overlay}
        className="absolute inset-0"
        style={{ cursor: drawing ? "crosshair" : "default", touchAction: drawing ? "none" : "pan-x pan-y" }}
        onPointerDown={onOverlayDown}
        onPointerMove={onOverlayMove}
        onPointerUp={onOverlayUp}
        onPointerCancel={() => setDraft(null)}
      >
        {elements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            scale={scale}
            selected={el.id === selectedId}
            interactive={tool === "select"}
            editing={el.id === editingId}
            onPointerDown={startDrag(el, "move")}
            onResizeStart={startDrag(el, "resize")}
            onDoubleClick={() => (el.type === "text" ? onEdit(el.id) : undefined)}
            onTextChange={(text, contentHeight) => {
              dispatch({ type: "transient", update: updateElement(el.id, { text, h: Math.max(el.h, contentHeight) }) });
            }}
            onTextCommit={() => {
              onEdit(null);
              if (el.type === "text" && !el.text.trim()) dispatch({ type: "transient", update: (s) => ({ ...s, elements: s.elements.filter((x) => x.id !== el.id) }) });
            }}
          />
        ))}
        {draftPreview}
      </div>
    </div>
  );
}
