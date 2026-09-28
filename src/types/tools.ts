import type { FileKind } from "./files";

export type ToolCategoryId =
  | "pdf"
  | "image"
  | "document"
  | "compression"
  | "conversion"
  | "editing"
  | "ocr"
  | "security"
  | "business"
  | "career";

/** Server engines that some tools need. Optional; configured via env on the server. */
export type EngineId = "libreoffice" | "qpdf" | "ghostscript";

export type ToolRuntime = "browser" | "server";

/**
 * - available: works now.
 * - engine: works when the named server engine is configured on this deployment.
 * - unavailable: listed for discoverability, clearly explained as not implemented.
 */
export type ToolStatus = "available" | "engine" | "unavailable";

/** Which UI renders the tool page. Processor tools share one generic runner. */
export type ToolUi =
  | "processor"
  | "editor"
  | "organizer"
  | "form-filler"
  | "ocr"
  | "link";

export type OptionValue = string | number | boolean;

interface OptionBase {
  key: string;
  label: string;
  help?: string;
  /** Only show when another option has one of these values. */
  showIf?: { key: string; equals: OptionValue[] };
}

export type OptionField =
  | (OptionBase & {
      type: "select";
      default: string;
      choices: Array<{ value: string; label: string; hint?: string }>;
    })
  | (OptionBase & {
      type: "segmented";
      default: string;
      choices: Array<{ value: string; label: string; hint?: string }>;
    })
  | (OptionBase & { type: "number"; default: number; min: number; max: number; step?: number; unit?: string })
  | (OptionBase & { type: "range"; default: number; min: number; max: number; step?: number; unit?: string })
  | (OptionBase & { type: "text"; default: string; placeholder?: string; maxLength?: number; multiline?: boolean })
  | (OptionBase & { type: "pages"; default: string; placeholder?: string })
  | (OptionBase & { type: "toggle"; default: boolean })
  | (OptionBase & { type: "color"; default: string });

export interface ToolDefinition {
  slug: string;
  name: string;
  /** One-line description shown on cards and page header. */
  description: string;
  /** Meta description for SEO. */
  seoDescription?: string;
  category: ToolCategoryId;
  /** Extra categories this tool is listed under (e.g. compression + pdf). */
  alsoIn?: ToolCategoryId[];
  keywords: string[];
  icon: string;
  status: ToolStatus;
  ui: ToolUi;
  runtime: ToolRuntime;
  engine?: EngineId;
  /** Processor id in the processor registry. */
  processor?: string;
  /** Fixed options merged into user options (e.g. target format for jpg-to-png). */
  preset?: Record<string, OptionValue>;
  options?: OptionField[];
  accept: FileKind[];
  multiple?: boolean;
  minFiles?: number;
  maxFiles?: number;
  /** Where "link" tools navigate (business/career apps). */
  href?: string;
  popular?: boolean;
  /** Explanation shown for unavailable/engine tools and in the privacy panel. */
  note?: string;
  /** Editor tool preselected when this tool opens the PDF editor. */
  editorTool?: string;
  /** Short label for the result, e.g. "Compressed PDF". */
  resultLabel?: string;
}

export interface ToolCategory {
  id: ToolCategoryId;
  name: string;
  description: string;
  icon: string;
  color: string;
}
