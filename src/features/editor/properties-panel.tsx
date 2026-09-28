"use client";

import type { Dispatch } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Copy, Italic, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { removeElement, updateElement, type EditorAction } from "./state";
import { visualDims, type DocumentSettings, type EditorElement, type PdfPage } from "./types";

function NumberField({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <Field label={label}>
      {(p) => (
        <div className="relative">
          <Input {...p} type="number" inputMode="decimal" value={Math.round(value * 10) / 10} min={min} max={max} step={step} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} className={unit ? "pr-8" : undefined} />
          {unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle">{unit}</span>}
        </div>
      )}
    </Field>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(p) => <input {...p} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface p-1" />}
    </Field>
  );
}

const LABELS: Record<EditorElement["type"], string> = {
  text: "Text", image: "Image", rect: "Rectangle", ellipse: "Ellipse", whiteout: "Whiteout", line: "Line", arrow: "Arrow",
  ink: "Drawing", highlight: "Highlight", underline: "Underline", strike: "Strikethrough", comment: "Comment", stamp: "Stamp",
};

export function PropertiesPanel({
  element,
  page,
  pageIndex,
  pageCount,
  settings,
  dispatch,
  onDuplicate,
  onDeselect,
}: {
  element: EditorElement | null;
  page: PdfPage | null;
  pageIndex: number;
  pageCount: number;
  settings: DocumentSettings;
  dispatch: Dispatch<EditorAction>;
  onDuplicate: () => void;
  onDeselect: () => void;
}) {
  const set = (patch: Partial<EditorElement>) => element && dispatch({ type: "commit", update: updateElement(element.id, patch) });
  const setSettings = (patch: Partial<DocumentSettings>) => dispatch({ type: "commit", update: (s) => ({ ...s, settings: { ...s.settings, ...patch } }) });

  if (!element) {
    const dims = page ? visualDims(page) : null;
    return (
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Page</h3>
          {dims && (
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">Page</dt>
              <dd>
                {pageIndex + 1} of {pageCount}
              </dd>
              <dt className="text-muted">Size</dt>
              <dd>
                {Math.round((dims.width / 72) * 25.4)} × {Math.round((dims.height / 72) * 25.4)} mm
              </dd>
              <dt className="text-muted">Rotation</dt>
              <dd>{page?.rotate ?? 0}°</dd>
            </dl>
          )}
        </section>
        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Document</h3>
          <Switch label="Page numbers" checked={settings.pageNumbers} onChange={(v) => setSettings({ pageNumbers: v })} />
          {settings.pageNumbers && (
            <Field label="Number format">
              {(p) => (
                <Select {...p} value={settings.pageNumberFormat} onChange={(e) => setSettings({ pageNumberFormat: e.target.value })}>
                  <option value="{n}">1</option>
                  <option value="Page {n}">Page 1</option>
                  <option value="Page {n} of {total}">Page 1 of 10</option>
                  <option value="{n} / {total}">1 / 10</option>
                </Select>
              )}
            </Field>
          )}
          <Field label="Watermark" help="Applied to every page when you export.">
            {(p) => <Input {...p} value={settings.watermark} placeholder="e.g. DRAFT" maxLength={80} onChange={(e) => setSettings({ watermark: e.target.value })} />}
          </Field>
          {settings.watermark && <NumberField label="Watermark opacity" value={settings.watermarkOpacity} min={5} max={100} unit="%" onChange={(v) => setSettings({ watermarkOpacity: v })} />}
        </section>
        <p className="text-xs leading-relaxed text-subtle">
          Tip: existing PDF text can&apos;t be edited in place reliably. Use <strong>Whiteout</strong> to cover it, then add new text on top.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{LABELS[element.type]}</h3>
        <div className="flex">
          <IconButton size="sm" label="Duplicate" onClick={onDuplicate}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="Delete"
            className="hover:text-danger"
            onClick={() => {
              dispatch({ type: "commit", update: removeElement(element.id) });
              onDeselect();
            }}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      {element.type === "text" && (
        <>
          <Field label="Text">{(p) => <Textarea {...p} value={element.text} onChange={(e) => set({ text: e.target.value })} className="min-h-20" />}</Field>
          <Field label="Font">
            {(p) => (
              <Select {...p} value={element.font} onChange={(e) => set({ font: e.target.value as "sans" | "serif" | "mono" })}>
                <option value="sans">Sans (Helvetica)</option>
                <option value="serif">Serif (Times)</option>
                <option value="mono">Monospace (Courier)</option>
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Size" value={element.fontSize} min={4} max={200} unit="pt" onChange={(v) => set({ fontSize: v })} />
            <NumberField label="Line height" value={element.lineHeight} min={0.8} max={3} step={0.1} onChange={(v) => set({ lineHeight: v })} />
          </div>
          <div className="flex items-center gap-1">
            <IconButton size="sm" label="Bold" active={element.bold} aria-pressed={element.bold} onClick={() => set({ bold: !element.bold })}>
              <Bold className="size-4" />
            </IconButton>
            <IconButton size="sm" label="Italic" active={element.italic} aria-pressed={element.italic} onClick={() => set({ italic: !element.italic })}>
              <Italic className="size-4" />
            </IconButton>
            <span className="mx-1 h-5 w-px bg-border" />
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <IconButton key={a} size="sm" label={`Align ${a}`} active={element.align === a} aria-pressed={element.align === a} onClick={() => set({ align: a })}>
                  <Icon className="size-4" />
                </IconButton>
              );
            })}
          </div>
          <ColorField label="Color" value={element.color} onChange={(v) => set({ color: v })} />
        </>
      )}

      {(element.type === "rect" || element.type === "ellipse") && (
        <>
          <ColorField label="Border color" value={element.stroke} onChange={(v) => set({ stroke: v })} />
          <NumberField label="Border width" value={element.strokeWidth} min={0} max={40} unit="pt" onChange={(v) => set({ strokeWidth: v })} />
          <Switch label="Fill" checked={element.fill !== null} onChange={(v) => set({ fill: v ? "#fde68a" : null })} />
          {element.fill !== null && <ColorField label="Fill color" value={element.fill} onChange={(v) => set({ fill: v })} />}
        </>
      )}

      {(element.type === "line" || element.type === "arrow" || element.type === "ink") && (
        <>
          <ColorField label="Color" value={element.stroke} onChange={(v) => set({ stroke: v })} />
          <NumberField label="Thickness" value={element.strokeWidth} min={0.5} max={40} step={0.5} unit="pt" onChange={(v) => set({ strokeWidth: v })} />
        </>
      )}

      {(element.type === "highlight" || element.type === "underline" || element.type === "strike" || element.type === "stamp") && (
        <ColorField label="Color" value={element.color} onChange={(v) => set({ color: v })} />
      )}

      {element.type === "stamp" && <Field label="Stamp text">{(p) => <Input {...p} value={element.text} maxLength={40} onChange={(e) => set({ text: e.target.value })} />}</Field>}

      {element.type === "comment" && (
        <>
          <Field label="Comment" help="Exported as a real PDF comment (sticky note) that readers can open.">
            {(p) => <Textarea {...p} value={element.text} onChange={(e) => set({ text: e.target.value })} placeholder="Write a comment…" />}
          </Field>
          <ColorField label="Note color" value={element.color} onChange={(v) => set({ color: v })} />
        </>
      )}

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Position & size</h4>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="X" value={element.x} unit="pt" onChange={(v) => set({ x: v })} />
          <NumberField label="Y" value={element.y} unit="pt" onChange={(v) => set({ y: v })} />
          {element.type !== "comment" && element.type !== "ink" && element.type !== "line" && element.type !== "arrow" && (
            <>
              <NumberField label="Width" value={element.w} min={4} unit="pt" onChange={(v) => set({ w: Math.max(4, v) })} />
              <NumberField label="Height" value={element.h} min={4} unit="pt" onChange={(v) => set({ h: Math.max(4, v) })} />
            </>
          )}
        </div>
        {["text", "image", "rect", "ellipse", "stamp"].includes(element.type) && (
          <NumberField label="Rotation" value={element.rotation} min={-360} max={360} unit="°" onChange={(v) => set({ rotation: v })} />
        )}
        {element.type !== "comment" && (
          <Field label={<span className="flex justify-between"><span>Opacity</span><span className="font-normal text-muted">{Math.round(element.opacity * 100)}%</span></span>}>
            {(p) => <input {...p} type="range" min={10} max={100} value={Math.round(element.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} className="w-full accent-[var(--accent)]" />}
          </Field>
        )}
      </section>
      <Button variant="ghost" size="sm" onClick={onDeselect}>
        Done
      </Button>
    </div>
  );
}
