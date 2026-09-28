"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { EditorElement, FontFamilyId } from "./types";

export const CSS_FONTS: Record<FontFamilyId, string> = {
  sans: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  serif: "'Times New Roman', Times, 'Liberation Serif', serif",
  mono: "'Courier New', Courier, 'Liberation Mono', monospace",
};

/** Draws one element in page space; `scale` converts points to CSS pixels. */
export function ElementView({
  el,
  scale,
  selected,
  interactive,
  editing,
  onPointerDown,
  onResizeStart,
  onDoubleClick,
  onTextChange,
  onTextCommit,
}: {
  el: EditorElement;
  scale: number;
  selected: boolean;
  interactive: boolean;
  editing: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent) => void;
  onDoubleClick: () => void;
  onTextChange: (text: string, contentHeight: number) => void;
  onTextCommit: () => void;
}) {
  const box: CSSProperties = {
    position: "absolute",
    left: el.x * scale,
    top: el.y * scale,
    width: el.w * scale,
    height: el.h * scale,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity,
    touchAction: interactive ? "none" : undefined,
    pointerEvents: interactive ? "auto" : "none",
  };

  let content: ReactNode = null;
  switch (el.type) {
    case "text": {
      const style: CSSProperties = {
        fontFamily: CSS_FONTS[el.font],
        fontSize: el.fontSize * scale,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        color: el.color,
        textAlign: el.align,
        lineHeight: el.lineHeight,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      };
      content = editing ? (
        <textarea
          autoFocus
          aria-label="Edit text"
          value={el.text}
          onChange={(e) => onTextChange(e.target.value, e.target.scrollHeight / scale)}
          onBlur={onTextCommit}
          onKeyDown={(e) => {
            if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="size-full resize-none overflow-hidden bg-transparent p-0 outline-none"
          style={style}
        />
      ) : (
        <div className="size-full select-none" style={style}>
          {el.text || " "}
        </div>
      );
      break;
    }
    case "image":
      // eslint-disable-next-line @next/next/no-img-element -- user-inserted data URL
      content = <img src={el.src} alt="" draggable={false} className="size-full select-none object-fill" />;
      break;
    case "rect":
    case "whiteout":
      content = (
        <div
          className="size-full"
          style={{
            background: el.type === "whiteout" ? "#ffffff" : (el.fill ?? "transparent"),
            border: el.type === "whiteout" ? "none" : `${el.strokeWidth * scale}px solid ${el.stroke}`,
            boxShadow: el.type === "whiteout" && selected ? "inset 0 0 0 1px rgba(0,0,0,.15)" : undefined,
          }}
        />
      );
      break;
    case "ellipse":
      content = <div className="size-full rounded-[50%]" style={{ background: el.fill ?? "transparent", border: `${el.strokeWidth * scale}px solid ${el.stroke}` }} />;
      break;
    case "line":
    case "arrow":
    case "ink": {
      const pts = el.points.map(([x, y]) => `${(x - el.x) * scale},${(y - el.y) * scale}`).join(" ");
      const [a, b] = el.type !== "ink" ? el.points : [[0, 0], [0, 0]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const len = Math.max(8, el.strokeWidth * 4);
      const head = el.type === "arrow"
        ? [-1, 1].map((s) => `${(b[0] - el.x) * scale},${(b[1] - el.y) * scale} ${(b[0] - len * Math.cos(ang + s * 0.45) - el.x) * scale},${(b[1] - len * Math.sin(ang + s * 0.45) - el.y) * scale}`)
        : [];
      content = (
        <svg className="size-full overflow-visible" aria-hidden="true">
          <polyline points={pts} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth * scale} strokeLinecap="round" strokeLinejoin="round" />
          {head.map((h) => (
            <polyline key={h} points={h} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth * scale} strokeLinecap="round" />
          ))}
        </svg>
      );
      break;
    }
    case "highlight":
      content = <div className="size-full" style={{ background: el.color, opacity: 0.4, mixBlendMode: "multiply" }} />;
      break;
    case "underline":
    case "strike":
      content = (
        <div className="relative size-full">
          <div className="absolute inset-x-0" style={{ top: el.type === "underline" ? "calc(100% - 2px)" : "50%", height: Math.max(1, el.h * 0.08 * scale), background: el.color }} />
        </div>
      );
      break;
    case "comment":
      content = (
        <div className="flex size-full items-center justify-center rounded-sm shadow" style={{ background: el.color }} title={el.text}>
          <MessageSquare className="size-3/5 text-black/70" aria-hidden="true" />
        </div>
      );
      break;
    case "stamp":
      content = (
        <div
          className="flex size-full items-center justify-center rounded-md font-bold uppercase tracking-wider"
          style={{ border: `${2.5 * scale}px solid ${el.color}`, color: el.color, fontSize: Math.min(el.h * 0.5, (el.w * 0.85) / Math.max(1, el.text.length * 0.62)) * scale, fontFamily: CSS_FONTS.sans }}
        >
          {el.text}
        </div>
      );
      break;
  }

  return (
    <div
      style={box}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? `${el.type} element` : undefined}
      aria-pressed={interactive ? selected : undefined}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={cn(interactive && !editing && "cursor-move", selected && "outline-2 outline-offset-2 outline-accent")}
    >
      {content}
      {selected && interactive && !editing && el.type !== "comment" && (
        <span
          role="presentation"
          onPointerDown={onResizeStart}
          className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-sm border-2 border-accent bg-white"
          style={{ touchAction: "none" }}
        />
      )}
    </div>
  );
}
