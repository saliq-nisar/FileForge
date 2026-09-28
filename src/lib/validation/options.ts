import type { OptionField, OptionValue, ToolDefinition } from "@/types/tools";

export type ToolOptions = Record<string, OptionValue>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Validate and coerce options against a tool's declared schema. Unknown keys are
 * dropped, numbers are clamped, and presets always win. Used in the browser and
 * again on the server — client-provided options are never trusted as-is.
 */
export function sanitizeOptions(tool: ToolDefinition, input: Record<string, unknown>): ToolOptions {
  const out: ToolOptions = {};
  for (const field of tool.options ?? []) {
    out[field.key] = coerce(field, input[field.key]);
  }
  return { ...out, ...tool.preset };
}

function coerce(field: OptionField, value: unknown): OptionValue {
  switch (field.type) {
    case "select":
    case "segmented": {
      const v = String(value ?? "");
      return field.choices.some((c) => c.value === v) ? v : field.default;
    }
    case "number":
    case "range": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return field.default;
      return Math.min(field.max, Math.max(field.min, n));
    }
    case "toggle":
      return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : field.default;
    case "color": {
      const v = String(value ?? "");
      return HEX_COLOR.test(v) ? v.toLowerCase() : field.default;
    }
    case "text":
    case "pages": {
      if (typeof value !== "string") return field.default;
      const max = field.type === "text" ? (field.maxLength ?? 500) : 200;
      return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
    }
  }
}

export function isFieldVisible(field: OptionField, values: ToolOptions): boolean {
  if (!field.showIf) return true;
  return field.showIf.equals.includes(values[field.showIf.key] as OptionValue);
}

export function str(options: ToolOptions, key: string, fallback = ""): string {
  const v = options[key];
  return typeof v === "string" ? v : fallback;
}

export function num(options: ToolOptions, key: string, fallback = 0): number {
  const v = options[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function bool(options: ToolOptions, key: string, fallback = false): boolean {
  const v = options[key];
  return typeof v === "boolean" ? v : fallback;
}
