/**
 * Editor document model. All coordinates are PDF points in the page's *visual*
 * space (as displayed, top-left origin), independent of zoom.
 */
export type EditorTool =
  | "select"
  | "text"
  | "image"
  | "draw"
  | "highlight"
  | "underline"
  | "strike"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "whiteout"
  | "signature"
  | "comment"
  | "stamp";

export interface PdfPage {
  key: string;
  /** Index in the source PDF, or null for an inserted blank page. */
  source: number | null;
  /** Extra rotation applied by the user (0/90/180/270). */
  rotate: number;
  /** Visual size at rotate = 0 (includes the source page's own /Rotate). */
  baseWidth: number;
  baseHeight: number;
}

interface ElementBase {
  id: string;
  pageKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clockwise degrees around the element center. */
  rotation: number;
  opacity: number;
}

export type FontFamilyId = "sans" | "serif" | "mono";

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  font: FontFamilyId;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface ImageElement extends ElementBase {
  type: "image";
  /** PNG or JPEG data URL. */
  src: string;
}

export interface ShapeElement extends ElementBase {
  type: "rect" | "ellipse" | "whiteout";
  stroke: string;
  strokeWidth: number;
  fill: string | null;
}

export interface LineElement extends ElementBase {
  type: "line" | "arrow";
  /** Absolute points [start, end]. x/y/w/h is their bounding box. */
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}

export interface InkElement extends ElementBase {
  type: "ink";
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}

export interface MarkupElement extends ElementBase {
  type: "highlight" | "underline" | "strike";
  color: string;
}

export interface CommentElement extends ElementBase {
  type: "comment";
  text: string;
  color: string;
}

export interface StampElement extends ElementBase {
  type: "stamp";
  text: string;
  color: string;
}

export type EditorElement = TextElement | ImageElement | ShapeElement | LineElement | InkElement | MarkupElement | CommentElement | StampElement;

export interface DocumentSettings {
  pageNumbers: boolean;
  pageNumberFormat: string;
  watermark: string;
  watermarkOpacity: number;
}

export interface EditorSnapshot {
  pages: PdfPage[];
  elements: EditorElement[];
  settings: DocumentSettings;
}

export function visualDims(p: PdfPage): { width: number; height: number } {
  return p.rotate % 180 === 0 ? { width: p.baseWidth, height: p.baseHeight } : { width: p.baseHeight, height: p.baseWidth };
}
