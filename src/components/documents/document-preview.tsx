"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Align, Block, DocumentModel, Inline } from "@/services/documents/model";

const PX = 96 / 72;
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

function Runs({ runs, color }: { runs: Inline[]; color: string }) {
  return (
    <>
      {runs.map((r, i) => (
        <span key={i} style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? "italic" : undefined, color: r.color ?? color, whiteSpace: "pre-wrap" }}>
          {r.text}
        </span>
      ))}
    </>
  );
}

function BlocksView({ blocks, model }: { blocks: Block[]; model: DocumentModel }) {
  const t = model.theme;
  const px = (pt: number) => pt * PX;
  const ta = (a?: Align): CSSProperties["textAlign"] => a ?? "left";
  const out: ReactNode[] = blocks.map((b, i) => {
    switch (b.type) {
      case "heading": {
        const size = b.size ?? (b.level === 1 ? t.size * 2 : b.level === 2 ? t.size * 1.2 : t.size * 1.05);
        const before = i === 0 ? 0 : b.level === 1 ? t.size * 0.4 : b.level === 2 ? t.size * 1.1 : t.size * 0.6;
        return (
          <div key={i} style={{ marginTop: px(before), marginBottom: px(t.size * 0.3), fontSize: px(size), fontWeight: 700, color: b.color ?? t.text, textAlign: ta(b.align), lineHeight: t.lineHeight, borderBottom: b.rule ? `1px solid ${b.color ?? t.accent}` : undefined, paddingBottom: b.rule ? 3 : undefined, textTransform: b.uppercase ? "uppercase" : undefined }}>
            {b.text}
          </div>
        );
      }
      case "paragraph":
        return (
          <p key={i} style={{ fontSize: px(b.size ?? t.size), textAlign: ta(b.align), marginBottom: px(b.spaceAfter ?? t.size * 0.45), lineHeight: t.lineHeight }}>
            <Runs runs={b.runs} color={b.color ?? t.text} />
          </p>
        );
      case "list":
        return (
          <ul key={i} style={{ fontSize: px(b.size ?? t.size), paddingLeft: px((b.size ?? t.size) * 1.1), listStyle: "disc", marginBottom: px(t.size * 0.25), lineHeight: t.lineHeight }}>
            {b.items.map((item, j) => (
              <li key={j} style={{ marginBottom: px((b.size ?? t.size) * 0.2) }}>
                <Runs runs={item} color={t.text} />
              </li>
            ))}
          </ul>
        );
      case "table": {
        const total = b.columns.reduce((a, c) => a + c.width, 0);
        const size = b.size ?? t.size * 0.95;
        return (
          <table key={i} style={{ width: "100%", borderCollapse: "collapse", fontSize: px(size), marginBottom: px(t.size * 0.6), lineHeight: t.lineHeight }}>
            <thead>
              <tr style={{ background: b.headerBg, color: b.headerColor ?? t.text }}>
                {b.columns.map((c) => (
                  <th key={c.header} style={{ width: `${(c.width / total) * 100}%`, textAlign: ta(c.align), padding: px(size * 0.45), fontWeight: 700, borderBottom: b.borders === false ? undefined : "1px solid #d9d9de" }}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} style={{ background: b.zebra && ri % 2 === 1 ? "#f6f6f8" : undefined }}>
                  {r.map((c, ci) => (
                    <td key={ci} style={{ textAlign: ta(b.columns[ci]?.align), padding: px(size * 0.45), borderBottom: b.borders === false ? undefined : "1px solid #d9d9de", verticalAlign: "top", whiteSpace: "pre-wrap" }}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      case "columns": {
        const total = b.columns.reduce((a, c) => a + c.width, 0);
        return (
          <div key={i} style={{ display: "flex", gap: px(b.gap ?? 24) }}>
            {b.columns.map((c, j) => (
              <div key={j} style={{ flex: `${c.width / total} 1 0`, minWidth: 0 }}>
                <BlocksView blocks={c.blocks} model={model} />
              </div>
            ))}
          </div>
        );
      }
      case "keyValue":
        return (
          <div key={i} style={{ width: `${(b.width ?? 1) * 100}%`, marginLeft: b.align === "right" ? "auto" : undefined, fontSize: px(b.size ?? t.size), marginBottom: px(t.size * 0.4), lineHeight: t.lineHeight }}>
            {b.rows.map(([k, v], j) => {
              const last = b.emphasizeLast && j === b.rows.length - 1;
              return (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: last ? 700 : undefined, fontSize: last ? px((b.size ?? t.size) * 1.15) : undefined, borderTop: last ? `1px solid ${t.accent}` : undefined, paddingTop: last ? 5 : undefined, marginTop: last ? 3 : undefined }}>
                  <span style={{ color: last ? t.text : t.muted }}>{k}</span>
                  <span style={{ textAlign: "right" }}>{v}</span>
                </div>
              );
            })}
          </div>
        );
      case "spacer":
        return <div key={i} style={{ height: px(b.size) }} />;
      case "divider":
        return <hr key={i} style={{ border: 0, borderTop: `${b.thickness ?? 0.75}px solid ${b.color ?? "#d4d4d8"}`, margin: `${px(4)}px 0 ${px(4 + t.size * 0.3)}px` }} />;
      case "image":
        return (
          <div key={i} style={{ textAlign: ta(b.align), marginBottom: px(t.size * 0.4) }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied data URL (logo) */}
            <img src={b.src} alt="" style={{ width: px(b.width), height: px(b.height), display: "inline-block", objectFit: "contain" }} />
          </div>
        );
      case "banner":
        return (
          <div key={i} style={{ background: b.background, color: b.color, padding: `${px(14)}px ${px(18)}px`, marginBottom: px(t.size * 0.8), textAlign: ta(b.align) }}>
            <div style={{ fontSize: px(t.size * 1.9), fontWeight: 700, lineHeight: 1.2 }}>{b.title}</div>
            {b.subtitle && <div style={{ fontSize: px(t.size), marginTop: 4 }}>{b.subtitle}</div>}
          </div>
        );
    }
  });
  return <>{out}</>;
}

/**
 * Live HTML preview of a document model, scaled to fit its container.
 * Uses the same model as the PDF/DOCX exporters; page breaks are approximate.
 */
export function DocumentPreview({ model, label = "Document preview" }: { model: DocumentModel; label?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [w, h] = SIZES[model.pageSize];
  const paperW = w * PX;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, el.clientWidth / paperW));
      setHeight(paper.current?.offsetHeight ?? 0);
    });
    ro.observe(el);
    if (paper.current) ro.observe(paper.current);
    return () => ro.disconnect();
  }, [paperW]);

  const t = model.theme;
  return (
    <div ref={wrap} className="w-full" aria-label={label} role="region">
      <div style={{ height: height * scale }}>
        <div
          ref={paper}
          data-print-root
          style={{
            width: paperW,
            minHeight: h * PX,
            padding: t.margin * PX,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            fontFamily: t.font === "sans" ? "Arial, 'Liberation Sans', Helvetica, sans-serif" : "'Times New Roman', Times, serif",
            color: t.text,
            fontSize: t.size * PX,
            background: "#fff",
          }}
          className="relative shadow-md ring-1 ring-black/5"
        >
          <BlocksView blocks={model.blocks} model={model} />
          {model.footer && <p style={{ position: "absolute", bottom: (t.margin / 2) * PX, left: 0, right: 0, textAlign: "center", fontSize: t.size * 0.8 * PX, color: t.muted }}>{model.footer}</p>}
        </div>
      </div>
    </div>
  );
}
