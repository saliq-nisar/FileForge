/**
 * Format-independent document model. Templates turn content (invoice, resume,
 * letter…) into this model; renderers turn it into HTML preview, PDF, DOCX or TXT.
 * Content, layout, styling and export are therefore independent.
 */
export type Align = "left" | "center" | "right";

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export type Block =
  | { type: "heading"; text: string; level: 1 | 2 | 3; align?: Align; color?: string; rule?: boolean; uppercase?: boolean; size?: number }
  | { type: "paragraph"; runs: Inline[]; align?: Align; size?: number; color?: string; spaceAfter?: number }
  | { type: "list"; items: Inline[][]; size?: number }
  | {
      type: "table";
      columns: Array<{ header: string; width: number; align?: Align }>;
      rows: string[][];
      headerBg?: string;
      headerColor?: string;
      zebra?: boolean;
      size?: number;
      borders?: boolean;
    }
  | { type: "columns"; columns: Array<{ width: number; blocks: Block[] }>; gap?: number }
  | { type: "keyValue"; rows: Array<[string, string]>; width?: number; align?: Align; emphasizeLast?: boolean; size?: number }
  | { type: "spacer"; size: number }
  | { type: "divider"; color?: string; thickness?: number }
  | { type: "image"; src: string; width: number; height: number; align?: Align }
  | { type: "banner"; title: string; subtitle?: string; background: string; color: string; align?: Align };

export interface DocTheme {
  font: "sans" | "serif";
  /** Body size in pt. */
  size: number;
  accent: string;
  text: string;
  muted: string;
  /** Page margin in pt. */
  margin: number;
  lineHeight: number;
}

export interface DocumentModel {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  pageSize: "a4" | "letter";
  theme: DocTheme;
  blocks: Block[];
  /** Small text at the bottom of every page (never critical information). */
  footer?: string;
}

export const DEFAULT_THEME: DocTheme = {
  font: "sans",
  size: 10,
  accent: "#1f2937",
  text: "#111827",
  muted: "#6b7280",
  margin: 48,
  lineHeight: 1.35,
};

export const plain = (text: string, extra: Partial<Inline> = {}): Inline[] => [{ text, ...extra }];

/** All text of a model in reading order — used by TXT export and export checks. */
export function modelToText(model: DocumentModel): string {
  const out: string[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      switch (b.type) {
        case "heading":
          out.push("", b.uppercase ? b.text.toUpperCase() : b.text);
          break;
        case "paragraph":
          out.push(b.runs.map((r) => r.text).join(""));
          break;
        case "list":
          for (const item of b.items) out.push(`- ${item.map((r) => r.text).join("")}`);
          break;
        case "table":
          out.push(b.columns.map((c) => c.header).join("\t"));
          for (const r of b.rows) out.push(r.join("\t"));
          break;
        case "columns":
          for (const c of b.columns) walk(c.blocks);
          break;
        case "keyValue":
          for (const [k, v] of b.rows) out.push(`${k}: ${v}`);
          break;
        case "banner":
          out.push(b.title, ...(b.subtitle ? [b.subtitle] : []));
          break;
        case "divider":
        case "spacer":
        case "image":
          break;
      }
    }
  };
  walk(model.blocks);
  if (model.footer) out.push("", model.footer);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
