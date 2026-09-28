"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowRight, ArrowUp, Circle, Copy, Download, Eraser, FilePlus, Highlighter, Image as ImageIcon, LayoutPanelLeft,
  MessageSquare, Minus, MousePointer2, PanelRight, Pencil, Plus, Redo2, RotateCw, Signature, Square, Stamp, Strikethrough, Trash2,
  Type, Underline, Undo2, X,
} from "lucide-react";
import { Logo } from "@/components/layout/app-shell";
import { FileDropzone } from "@/components/files/file-dropzone";
import { PdfPage as PdfPageCanvas } from "@/components/files/pdf-page";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { ErrorState, Kbd, LoadingState } from "@/components/ui/misc";
import { useFileSelection } from "@/hooks/use-file-selection";
import { usePdfDocument } from "@/hooks/use-pdf-document";
import { toAppError } from "@/lib/errors";
import { deriveFileName } from "@/lib/file/names";
import { cn } from "@/lib/utils/cn";
import { downloadBlob } from "@/lib/utils/download";
import { toast } from "@/stores/toast-store";
import { imageFileToDataUrl } from "./image-utils";
import { newId, PageView, type ToolStyle } from "./page-view";
import { PropertiesPanel } from "./properties-panel";
import { SignatureDialog, type SignatureResult } from "./signature-dialog";
import { addElement, editorReducer, initialEditorState, removeElement, translateElement, updateElement } from "./state";
import { visualDims, type EditorElement, type EditorTool, type PdfPage } from "./types";

const TOOLS: Array<{ id: EditorTool; label: string; icon: typeof Type; key?: string }> = [
  { id: "select", label: "Select", icon: MousePointer2, key: "v" },
  { id: "text", label: "Text", icon: Type, key: "t" },
  { id: "image", label: "Image", icon: ImageIcon, key: "i" },
  { id: "draw", label: "Draw", icon: Pencil, key: "d" },
  { id: "highlight", label: "Highlight", icon: Highlighter, key: "h" },
  { id: "underline", label: "Underline", icon: Underline },
  { id: "strike", label: "Strikethrough", icon: Strikethrough },
  { id: "rect", label: "Rectangle", icon: Square, key: "r" },
  { id: "ellipse", label: "Ellipse", icon: Circle, key: "o" },
  { id: "line", label: "Line", icon: Minus, key: "l" },
  { id: "arrow", label: "Arrow", icon: ArrowRight, key: "a" },
  { id: "whiteout", label: "Whiteout (cover content)", icon: Eraser, key: "w" },
  { id: "signature", label: "Signature", icon: Signature, key: "s" },
  { id: "comment", label: "Comment", icon: MessageSquare, key: "c" },
  { id: "stamp", label: "Stamp", icon: Stamp },
];

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const PX_PER_PT = 96 / 72;

let pageSeq = 0;

export function PdfEditor({ initialTool }: { initialTool?: string }) {
  const rules = useMemo(() => ({ accept: ["pdf" as const], multiple: false }), []);
  const selection = useFileSelection(rules);
  const file = selection.files[0]?.file ?? null;
  const [blankMode, setBlankMode] = useState(false);
  const { doc, error, loading } = usePdfDocument(file);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const { pages, elements, settings } = state.present;
  const [tool, setTool] = useState<EditorTool>((TOOLS.find((t) => t.id === initialTool)?.id as EditorTool) ?? "select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [style, setStyle] = useState<ToolStyle>({ color: "#111111", strokeWidth: 2, highlight: "#fde047", fontSize: 14, stamp: "APPROVED" });
  const [placement, setPlacement] = useState<{ pageKey: string; x: number; y: number; kind: "image" | "signature" } | null>(null);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sourceBytes = useRef<Uint8Array | null>(null);

  // Load pages once PDF.js has opened the document.
  useEffect(() => {
    if (!doc || !file) return;
    let cancelled = false;
    (async () => {
      sourceBytes.current = new Uint8Array(await file.arrayBuffer());
      const list: PdfPage[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i);
        const v = p.getViewport({ scale: 1 });
        list.push({ key: `pg${++pageSeq}`, source: i - 1, rotate: 0, baseWidth: v.width, baseHeight: v.height });
      }
      if (!cancelled) dispatch({ type: "load", pages: list });
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, file]);

  const startBlank = () => {
    sourceBytes.current = null;
    setBlankMode(true);
    dispatch({ type: "load", pages: [{ key: `pg${++pageSeq}`, source: null, rotate: 0, baseWidth: 595.28, baseHeight: 841.89 }] });
  };

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const scale = zoom * PX_PER_PT;
  const ready = pages.length > 0 && (blankMode || doc);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) setEditingId(null);
  }, []);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = { ...selected, id: newId(), ...translateElement(selected, 12, 12) } as EditorElement;
    dispatch({ type: "commit", update: addElement(copy) });
    setSelectedId(copy.id);
  }, [selected]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    dispatch({ type: "commit", update: removeElement(selectedId) });
    select(null);
  }, [selectedId, select]);

  // Keyboard shortcuts (ignored while typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable || document.querySelector("dialog[open]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") {
        select(null);
        setTool("select");
      } else if (selected && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        dispatch({ type: "commit", update: updateElement(selected.id, translateElement(selected, dx, dy)) });
      } else if (!mod && !e.altKey) {
        const match = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (match) chooseTool(match.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Ctrl + wheel and two-finger pinch zoom on the canvas area.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.4, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startZoom = 1;
    const dist = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        startDist = dist();
        setZoom((z) => ((startZoom = z), z));
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && startDist > 0) setZoom(Math.min(3, Math.max(0.4, (startZoom * dist()) / startDist)));
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) startDist = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [ready]);

  // Track the page in view for the thumbnail highlight and page actions.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setCurrentPage(Number((visible.target as HTMLElement).dataset.pageIndex));
      },
      { root: el, threshold: [0.25, 0.5, 0.75] },
    );
    el.querySelectorAll("[data-page-index]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [pages, zoom]);

  function chooseTool(id: EditorTool) {
    setTool(id);
    if (id !== "select") select(null);
    if (id === "image" || id === "signature") {
      // Place on the page currently in view, centered.
      const p = pages[currentPage];
      if (p) {
        const { width, height } = visualDims(p);
        requestPlacement(p.key, width / 2, height / 2, id);
      }
    }
  }

  function requestPlacement(pageKey: string, x: number, y: number, kind: "image" | "signature" = tool === "signature" ? "signature" : "image") {
    setPlacement({ pageKey, x, y, kind });
    if (kind === "image") imageInput.current?.click();
  }

  const placeImage = (img: SignatureResult, kind: "image" | "signature") => {
    if (!placement) return;
    const page = pages.find((p) => p.key === placement.pageKey);
    if (!page) return;
    const { width, height } = visualDims(page);
    const maxW = kind === "signature" ? 180 : width * 0.5;
    const s = Math.min(1, maxW / (img.width * 0.75), (height * 0.5) / (img.height * 0.75));
    const w = img.width * 0.75 * s;
    const h = img.height * 0.75 * s;
    const el: EditorElement = {
      id: newId(), type: "image", pageKey: page.key, src: img.src, rotation: 0, opacity: 1,
      x: Math.max(0, Math.min(width - w, placement.x - w / 2)), y: Math.max(0, Math.min(height - h, placement.y - h / 2)), w, h,
    };
    dispatch({ type: "commit", update: addElement(el) });
    setPlacement(null);
    setTool("select");
    setSelectedId(el.id);
  };

  // ---------- page operations ----------
  const pageOp = (fn: (pages: PdfPage[], i: number) => PdfPage[], i = currentPage) => dispatch({ type: "commit", update: (s) => ({ ...s, pages: fn(s.pages, i) }) });
  const rotatePage = (i = currentPage) => {
    const key = pages[i]?.key;
    if (elements.some((e) => e.pageKey === key)) {
      toast.warning("Rotate pages before adding content to them, so your annotations stay in place.");
      return;
    }
    pageOp((ps, idx) => ps.map((p, j) => (j === idx ? { ...p, rotate: (p.rotate + 90) % 360 } : p)), i);
  };
  const deletePage = (i = currentPage) => {
    if (pages.length <= 1) return toast.warning("A PDF needs at least one page.");
    const key = pages[i].key;
    dispatch({ type: "commit", update: (s) => ({ ...s, pages: s.pages.filter((p) => p.key !== key), elements: s.elements.filter((e) => e.pageKey !== key) }) });
  };
  const duplicatePage = (i = currentPage) => {
    const src = pages[i];
    const copy = { ...src, key: `pg${++pageSeq}` };
    dispatch({
      type: "commit",
      update: (s) => ({
        ...s,
        pages: [...s.pages.slice(0, i + 1), copy, ...s.pages.slice(i + 1)],
        elements: [...s.elements, ...s.elements.filter((e) => e.pageKey === src.key).map((e) => ({ ...e, id: newId(), pageKey: copy.key }))],
      }),
    });
  };
  const insertBlank = (i = currentPage) => {
    const ref = pages[i];
    const dims = ref ? visualDims(ref) : { width: 595.28, height: 841.89 };
    pageOp((ps, idx) => [...ps.slice(0, idx + 1), { key: `pg${++pageSeq}`, source: null, rotate: 0, baseWidth: dims.width, baseHeight: dims.height }, ...ps.slice(idx + 1)], i);
  };
  const movePage = (i: number, d: number) =>
    pageOp((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const c = [...ps];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const goToPage = (i: number) => {
    scroller.current?.querySelector(`[data-page-index="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setThumbsOpen(false);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { exportEditedPdf } = await import("@/services/editor/export");
      const bytes = await exportEditedPdf(sourceBytes.current, pages, elements, settings);
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), file ? deriveFileName(file.name, "edited", "pdf") : "document.pdf");
      toast.success("PDF exported.");
    } catch (e) {
      toast.error(toAppError(e).userMessage);
    } finally {
      setExporting(false);
    }
  };

  const closeDocument = () => {
    selection.clear();
    setBlankMode(false);
    dispatch({ type: "load", pages: [] });
    select(null);
  };

  const fitWidth = () => {
    const w = scroller.current?.clientWidth ?? 800;
    const p = pages[currentPage];
    if (p) setZoom(Math.min(3, Math.max(0.4, (w - 48) / (visualDims(p).width * PX_PER_PT))));
  };

  // ---------- rendering ----------
  const thumbnails = (
    <ol className="flex flex-col items-center gap-3 p-3" aria-label="Pages">
      {pages.map((p, i) => {
        const { width, height } = visualDims(p);
        const tw = 104;
        return (
          <li key={p.key} className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => goToPage(i)} aria-label={`Go to page ${i + 1}`} aria-current={i === currentPage ? "page" : undefined} className={cn("rounded-sm p-0.5 ring-2 transition-colors", i === currentPage ? "ring-accent" : "ring-transparent hover:ring-border-strong")}>
              {p.source !== null && doc ? <PdfPageCanvas doc={doc} pageNumber={p.source + 1} width={tw} rotation={p.rotate} /> : <span className="block bg-white shadow-sm ring-1 ring-black/5" style={{ width: tw, height: (tw * height) / width }} />}
            </button>
            <div className="flex items-center">
              <IconButton size="sm" label={`Move page ${i + 1} up`} disabled={i === 0} onClick={() => movePage(i, -1)} className="size-7">
                <ArrowUp className="size-3.5" />
              </IconButton>
              <span className="w-6 text-center text-xs text-muted">{i + 1}</span>
              <IconButton size="sm" label={`Move page ${i + 1} down`} disabled={i === pages.length - 1} onClick={() => movePage(i, 1)} className="size-7">
                <ArrowDown className="size-3.5" />
              </IconButton>
            </div>
          </li>
        );
      })}
    </ol>
  );

  const properties = (
    <PropertiesPanel element={selected} page={pages[currentPage] ?? null} pageIndex={currentPage} pageCount={pages.length} settings={settings} dispatch={dispatch} onDuplicate={duplicateSelected} onDeselect={() => select(null)} />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Menu bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <Logo compact />
        <span className="hidden max-w-48 truncate text-sm font-medium sm:block" title={file?.name}>
          {file?.name ?? (blankMode ? "Untitled document" : "PDF Editor")}
        </span>
        {ready && (
          <nav aria-label="Editor menu" className="ml-2 hidden items-center md:flex">
            <Dropdown label="File" align="start" items={[
              { label: "Export PDF", onSelect: () => void exportPdf() },
              { label: "Close document", onSelect: closeDocument },
            ]} trigger={(p) => <button {...p} type="button" className="rounded px-2.5 py-1.5 text-sm text-muted hover:bg-bg-subtle hover:text-fg">File</button>} />
            <Dropdown label="Edit" align="start" items={[
              { label: "Undo", disabled: !state.past.length, onSelect: () => dispatch({ type: "undo" }) },
              { label: "Redo", disabled: !state.future.length, onSelect: () => dispatch({ type: "redo" }) },
              { label: "Duplicate selection", disabled: !selected, onSelect: duplicateSelected },
              { label: "Delete selection", disabled: !selected, danger: true, onSelect: deleteSelected },
            ]} trigger={(p) => <button {...p} type="button" className="rounded px-2.5 py-1.5 text-sm text-muted hover:bg-bg-subtle hover:text-fg">Edit</button>} />
            <Dropdown label="Page" align="start" items={[
              { label: "Rotate page", onSelect: () => rotatePage() },
              { label: "Duplicate page", onSelect: () => duplicatePage() },
              { label: "Insert blank page after", onSelect: () => insertBlank() },
              { label: "Delete page", danger: true, onSelect: () => deletePage() },
            ]} trigger={(p) => <button {...p} type="button" className="rounded px-2.5 py-1.5 text-sm text-muted hover:bg-bg-subtle hover:text-fg">Page</button>} />
            <Dropdown label="View" align="start" items={[
              { label: "Zoom in", onSelect: () => setZoom((z) => Math.min(3, z * 1.25)) },
              { label: "Zoom out", onSelect: () => setZoom((z) => Math.max(0.4, z / 1.25)) },
              { label: "Actual size", onSelect: () => setZoom(1) },
              { label: "Fit width", onSelect: fitWidth },
            ]} trigger={(p) => <button {...p} type="button" className="rounded px-2.5 py-1.5 text-sm text-muted hover:bg-bg-subtle hover:text-fg">View</button>} />
            <button type="button" onClick={() => setShortcutsOpen(true)} className="rounded px-2.5 py-1.5 text-sm text-muted hover:bg-bg-subtle hover:text-fg">
              Help
            </button>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {ready && (
            <Button size="sm" icon={<Download className="size-4" />} loading={exporting} onClick={exportPdf}>
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">Export</span>
            </Button>
          )}
          <Link href="/tools" aria-label="Close editor" title="Close editor" className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-bg-subtle hover:text-fg">
            <X className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {!ready ? (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-2xl">
            {loading ? (
              <LoadingState label="Opening PDF…" />
            ) : error ? (
              <ErrorState message={error} action={<Button variant="secondary" onClick={closeDocument}>Choose another file</Button>} />
            ) : (
              <>
                <h1 className="mb-1 text-2xl font-semibold tracking-tight">Edit PDF</h1>
                <p className="mb-6 text-muted">Add text, images, shapes, drawings, highlights, comments and signatures. Everything happens in your browser.</p>
                <FileDropzone accept={["pdf"]} onFiles={(f) => void selection.add(f)} busy={selection.validating} />
                <div className="mt-4 text-center">
                  <Button variant="ghost" icon={<FilePlus className="size-4" />} onClick={startBlank}>
                    Start with a blank page
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar: horizontally scrollable on small screens */}
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-2">
            <IconButton size="sm" label="Pages" className="md:hidden" onClick={() => setThumbsOpen(true)}>
              <LayoutPanelLeft className="size-4" />
            </IconButton>
            <div role="toolbar" aria-label="Editing tools" className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {TOOLS.map((t) => (
                <IconButton key={t.id} size="sm" label={`${t.label}${t.key ? ` (${t.key.toUpperCase()})` : ""}`} active={tool === t.id} aria-pressed={tool === t.id} onClick={() => chooseTool(t.id)}>
                  <t.icon className="size-4" />
                </IconButton>
              ))}
              <span className="mx-1 h-6 w-px shrink-0 bg-border" />
              <label className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-muted" title="Color for new items">
                <span className="sr-only">Color</span>
                <input type="color" value={style.color} onChange={(e) => setStyle((s) => ({ ...s, color: e.target.value }))} className="size-7 cursor-pointer rounded border border-border bg-surface p-0.5" aria-label="Color for new items" />
              </label>
              {tool === "highlight" && (
                <input type="color" value={style.highlight} onChange={(e) => setStyle((s) => ({ ...s, highlight: e.target.value }))} className="size-7 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5" aria-label="Highlight color" />
              )}
              {(tool === "draw" || tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow") && (
                <select aria-label="Stroke width" value={style.strokeWidth} onChange={(e) => setStyle((s) => ({ ...s, strokeWidth: Number(e.target.value) }))} className="h-8 shrink-0 rounded border border-border bg-surface px-1.5 text-xs">
                  {[1, 2, 3, 5, 8].map((w) => <option key={w} value={w}>{w} pt</option>)}
                </select>
              )}
              {tool === "text" && (
                <select aria-label="Font size" value={style.fontSize} onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))} className="h-8 shrink-0 rounded border border-border bg-surface px-1.5 text-xs">
                  {[9, 10, 11, 12, 14, 16, 18, 24, 32, 48].map((w) => <option key={w} value={w}>{w} pt</option>)}
                </select>
              )}
              {tool === "stamp" && (
                <select aria-label="Stamp text" value={style.stamp} onChange={(e) => setStyle((s) => ({ ...s, stamp: e.target.value }))} className="h-8 shrink-0 rounded border border-border bg-surface px-1.5 text-xs">
                  {["APPROVED", "REJECTED", "DRAFT", "CONFIDENTIAL", "PAID", "REVIEWED", "FINAL"].map((w) => <option key={w}>{w}</option>)}
                </select>
              )}
              <span className="mx-1 h-6 w-px shrink-0 bg-border" />
              <IconButton size="sm" label="Undo (Ctrl+Z)" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}>
                <Undo2 className="size-4" />
              </IconButton>
              <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}>
                <Redo2 className="size-4" />
              </IconButton>
              <span className="mx-1 h-6 w-px shrink-0 bg-border" />
              <IconButton size="sm" label="Zoom out" onClick={() => setZoom((z) => ZOOMS.slice().reverse().find((x) => x < z - 0.01) ?? 0.4)}>
                <Minus className="size-4" />
              </IconButton>
              <button type="button" onClick={fitWidth} className="h-8 w-12 shrink-0 rounded text-xs tabular-nums text-muted hover:bg-bg-subtle" title="Fit width">
                {Math.round(zoom * 100)}%
              </button>
              <IconButton size="sm" label="Zoom in" onClick={() => setZoom((z) => ZOOMS.find((x) => x > z + 0.01) ?? 3)}>
                <Plus className="size-4" />
              </IconButton>
              <IconButton size="sm" label="Rotate current page" onClick={() => rotatePage()}>
                <RotateCw className="size-4" />
              </IconButton>
              <IconButton size="sm" label="Duplicate current page" onClick={() => duplicatePage()}>
                <Copy className="size-4" />
              </IconButton>
              <IconButton size="sm" label="Delete current page" onClick={() => deletePage()}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            <IconButton size="sm" label="Properties" className="lg:hidden" onClick={() => setPropsOpen(true)}>
              <PanelRight className="size-4" />
            </IconButton>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside aria-label="Page thumbnails" className="hidden w-40 shrink-0 overflow-y-auto border-r border-border bg-surface md:block">
              {thumbnails}
            </aside>
            <div ref={scroller} className="min-w-0 flex-1 overflow-auto bg-bg-subtle" style={{ touchAction: "pan-x pan-y" }}>
              <div className="flex min-w-max flex-col items-center gap-6 p-4 sm:p-8">
                {pages.map((p, i) => (
                  <PageView
                    key={p.key}
                    page={p}
                    index={i}
                    doc={doc}
                    scale={scale}
                    elements={elements.filter((e) => e.pageKey === p.key)}
                    tool={tool}
                    style={style}
                    selectedId={selectedId}
                    editingId={editingId}
                    dispatch={dispatch}
                    onSelect={select}
                    onEdit={(id) => {
                      if (id && id !== editingId) {
                        const el = elements.find((e) => e.id === id);
                        if (el?.type === "text" && el.text) dispatch({ type: "checkpoint" }); // make edits to existing text undoable
                      }
                      setEditingId(id);
                    }}
                    onToolDone={() => setTool((t) => (t === "draw" || t === "highlight" ? t : "select"))}
                    onRequestPlacement={(k, x, y) => requestPlacement(k, x, y)}
                  />
                ))}
              </div>
            </div>
            <aside aria-label="Properties" className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4 lg:block">
              {properties}
            </aside>
          </div>
        </>
      )}

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return setPlacement(null);
          const img = await imageFileToDataUrl(f);
          if (img) placeImage(img, "image");
        }}
      />
      <SignatureDialog open={placement?.kind === "signature"} onClose={() => { setPlacement(null); setTool("select"); }} onDone={(s) => placeImage(s, "signature")} />
      <Dialog open={thumbsOpen} onClose={() => setThumbsOpen(false)} title="Pages" variant="left">
        {thumbnails}
      </Dialog>
      <Dialog open={propsOpen} onClose={() => setPropsOpen(false)} title={selected ? "Properties" : "Document"} variant="bottom">
        {properties}
      </Dialog>
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {TOOLS.filter((t) => t.key).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3"><span className="text-muted">{t.label}</span><Kbd>{t.key!.toUpperCase()}</Kbd></li>
          ))}
          <li className="flex items-center justify-between gap-3"><span className="text-muted">Undo / Redo</span><Kbd>Ctrl Z / Ctrl ⇧ Z</Kbd></li>
          <li className="flex items-center justify-between gap-3"><span className="text-muted">Duplicate</span><Kbd>Ctrl D</Kbd></li>
          <li className="flex items-center justify-between gap-3"><span className="text-muted">Delete</span><Kbd>Del</Kbd></li>
          <li className="flex items-center justify-between gap-3"><span className="text-muted">Nudge (×10 with Shift)</span><Kbd>Arrows</Kbd></li>
          <li className="flex items-center justify-between gap-3"><span className="text-muted">Zoom</span><Kbd>Ctrl + scroll</Kbd></li>
        </ul>
      </Dialog>
    </div>
  );
}
