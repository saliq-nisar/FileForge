import type { DocumentSettings, EditorElement, EditorSnapshot, PdfPage } from "./types";

export interface EditorState {
  past: EditorSnapshot[];
  present: EditorSnapshot;
  future: EditorSnapshot[];
}

export type EditorAction =
  | { type: "load"; pages: PdfPage[] }
  /** Commit a change to history (one undo step). */
  | { type: "commit"; update: (s: EditorSnapshot) => EditorSnapshot }
  /** Transient change during a drag; call "checkpoint" before starting. */
  | { type: "transient"; update: (s: EditorSnapshot) => EditorSnapshot }
  | { type: "checkpoint" }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 100;

export const DEFAULT_SETTINGS: DocumentSettings = {
  pageNumbers: false,
  pageNumberFormat: "Page {n} of {total}",
  watermark: "",
  watermarkOpacity: 20,
};

export const initialEditorState: EditorState = {
  past: [],
  present: { pages: [], elements: [], settings: DEFAULT_SETTINGS },
  future: [],
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "load":
      return { past: [], future: [], present: { pages: action.pages, elements: [], settings: DEFAULT_SETTINGS } };
    case "commit": {
      const next = action.update(state.present);
      if (next === state.present) return state;
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: next, future: [] };
    }
    case "checkpoint":
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: state.present, future: [] };
    case "transient":
      return { ...state, present: action.update(state.present) };
    case "undo": {
      if (!state.past.length) return state;
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
    }
    case "redo": {
      if (!state.future.length) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
    }
  }
}

// ---------- snapshot helpers ----------
export const updateElement = (id: string, patch: Partial<EditorElement>) => (s: EditorSnapshot): EditorSnapshot => ({
  ...s,
  elements: s.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as EditorElement) : e)),
});

export const addElement = (el: EditorElement) => (s: EditorSnapshot): EditorSnapshot => ({ ...s, elements: [...s.elements, el] });

export const removeElement = (id: string) => (s: EditorSnapshot): EditorSnapshot => ({ ...s, elements: s.elements.filter((e) => e.id !== id) });

export function translateElement(el: EditorElement, dx: number, dy: number): Partial<EditorElement> {
  const base = { x: el.x + dx, y: el.y + dy };
  if (el.type === "ink" || el.type === "line" || el.type === "arrow") {
    return { ...base, points: el.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  }
  return base;
}

/** Resize keeping the top-left fixed; scales point-based elements proportionally. */
export function resizeElement(el: EditorElement, w: number, h: number): Partial<EditorElement> {
  const nw = Math.max(4, w);
  const nh = Math.max(4, h);
  if (el.type === "ink" || el.type === "line" || el.type === "arrow") {
    const sx = el.w ? nw / el.w : 1;
    const sy = el.h ? nh / el.h : 1;
    return { w: nw, h: nh, points: el.points.map(([x, y]) => [el.x + (x - el.x) * sx, el.y + (y - el.y) * sy] as [number, number]) };
  }
  return { w: nw, h: nh };
}

export function boundsOf(points: [number, number][], pad = 0): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(1, Math.max(...xs) - x + pad), h: Math.max(1, Math.max(...ys) - y + pad) };
}

/** Ramer–Douglas–Peucker simplification to keep freehand paths small. */
export function simplify(points: [number, number][], tolerance = 0.6): [number, number][] {
  if (points.length < 3) return points;
  const sq = (a: [number, number], b: [number, number], p: [number, number]) => {
    const [x1, y1] = a;
    const [x2, y2] = b;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / len)) : 0;
    const px = x1 + t * dx - p[0];
    const py = y1 + t * dy - p[1];
    return px * px + py * py;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const tol = tolerance * tolerance;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = sq(points[s], points[e], points[i]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
