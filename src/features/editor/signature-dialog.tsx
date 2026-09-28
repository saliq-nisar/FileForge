"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { imageFileToDataUrl } from "./image-utils";

export interface SignatureResult {
  src: string;
  width: number;
  height: number;
}

/** Draw, type or upload a signature. Output is a transparent PNG. */
export function SignatureDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (s: SignatureResult) => void }) {
  const [mode, setMode] = useState<"draw" | "type" | "upload">("draw");
  const [typed, setTyped] = useState("");
  const [color, setColor] = useState("#0f172a");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!open || mode !== "draw") return;
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    setHasInk(false);
  }, [open, mode]);

  const pos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const trimmed = (c: HTMLCanvasElement): SignatureResult | null => {
    const ctx = c.getContext("2d")!;
    const { width, height } = c;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    if (maxX < 0) return null;
    const pad = 4;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(c, minX - pad, minY - pad, w, h, 0, 0, w, h);
    return { src: out.toDataURL("image/png"), width: w, height: h };
  };

  const finishTyped = () => {
    const c = document.createElement("canvas");
    const size = 96;
    const ctx = c.getContext("2d")!;
    const font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(typed).width + 40);
    c.height = size * 1.6;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(typed, 20, c.height / 2);
    const r = trimmed(c);
    if (r) onDone(r);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add signature"
      description="Your signature is created and placed locally — it's never uploaded."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {mode === "draw" && (
            <Button
              disabled={!hasInk}
              onClick={() => {
                const r = canvas.current && trimmed(canvas.current);
                if (r) onDone(r);
              }}
            >
              Use signature
            </Button>
          )}
          {mode === "type" && (
            <Button disabled={!typed.trim()} onClick={finishTyped}>
              Use signature
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs label="Signature method" value={mode} onChange={setMode} tabs={[{ value: "draw", label: "Draw" }, { value: "type", label: "Type" }, { value: "upload", label: "Upload image" }]} />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Ink color</span>
          {["#0f172a", "#1d4ed8", "#b91c1c"].map((c) => (
            <button key={c} type="button" aria-label={`Ink color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className="size-6 rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-accent" style={{ background: c }} />
          ))}
        </div>
        {mode === "draw" && (
          <div>
            <canvas
              ref={canvas}
              aria-label="Signature drawing area. Draw with your mouse, finger or pen."
              className="h-48 w-full touch-none rounded-md border border-border bg-white"
              onPointerDown={(e) => {
                drawing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                const ctx = e.currentTarget.getContext("2d")!;
                ctx.strokeStyle = color;
                const [x, y] = pos(e);
                ctx.beginPath();
                ctx.moveTo(x, y);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = e.currentTarget.getContext("2d")!;
                const [x, y] = pos(e);
                ctx.lineTo(x, y);
                ctx.stroke();
                setHasInk(true);
              }}
              onPointerUp={() => (drawing.current = false)}
            />
            <button
              type="button"
              className="mt-2 text-xs text-muted underline-offset-2 hover:underline"
              onClick={() => {
                const c = canvas.current!;
                c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
                setHasInk(false);
              }}
            >
              Clear
            </button>
          </div>
        )}
        {mode === "type" && (
          <div className="flex flex-col gap-3">
            <Input aria-label="Type your name" placeholder="Type your name" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={60} />
            <div className="flex h-24 items-center justify-center rounded-md border border-border bg-white px-4 text-4xl italic" style={{ color, fontFamily: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' }}>
              {typed || <span className="text-base not-italic text-subtle">Preview</span>}
            </div>
          </div>
        )}
        {mode === "upload" && (
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Upload signature image"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = await imageFileToDataUrl(f, 1200);
              if (r) onDone(r);
            }}
          />
        )}
      </div>
    </Dialog>
  );
}
