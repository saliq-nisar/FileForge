import type { DetectedFormat, FileKind } from "@/types/files";
import { BROWSER_MAX_BYTES, MAX_FILES_PER_BATCH, MAX_TOTAL_SELECTION_BYTES, RECOMMENDED_MAX_BYTES } from "@/lib/constants/limits";
import { ERROR_MESSAGES } from "@/lib/errors";
import { FORMATS, getExtension, kindFromExtension } from "@/lib/file/formats";
import { formatBytes } from "@/lib/file/size";

export interface FileRules {
  accept: FileKind[];
  maxFiles?: number;
  /** Override the per-family size limit (bytes). */
  maxBytes?: number;
}

export interface FileIssue {
  name: string;
  message: string;
}

/**
 * The extension must not contradict the detected content. Different image
 * extensions are tolerated (a PNG named .jpg is common and harmless), but an
 * executable or a PDF disguised as an image is rejected.
 */
export function extensionMatches(fileName: string, format: DetectedFormat): boolean {
  const ext = getExtension(fileName);
  if (!ext) return true;
  const claimed = kindFromExtension(ext);
  if (!claimed) {
    // Unknown extension: only acceptable for text content (e.g. .json, .md).
    return format.family === "text";
  }
  if (claimed === format.kind) return true;
  const claimedFamily = FORMATS[claimed].family;
  if (claimedFamily === "image" && format.family === "image") return true;
  if (claimedFamily === "text" && format.family === "text") return true;
  return false;
}

export function validateDetectedFile(
  file: { name: string; size: number },
  format: DetectedFormat,
  rules: FileRules,
): { error?: string; warning?: string } {
  if (file.size === 0) return { error: ERROR_MESSAGES.EMPTY_FILE };
  if (format.kind === "unknown" || !rules.accept.includes(format.kind)) {
    return { error: ERROR_MESSAGES.UNSUPPORTED_FORMAT };
  }
  if (!extensionMatches(file.name, format)) {
    return { error: "This file's extension doesn't match its contents." };
  }
  const max = rules.maxBytes ?? BROWSER_MAX_BYTES[format.family];
  if (file.size > max) {
    return { error: `${ERROR_MESSAGES.FILE_TOO_LARGE} (limit ${formatBytes(max)})` };
  }
  if (file.size > RECOMMENDED_MAX_BYTES[format.family]) {
    return { warning: "This file is larger than the recommended size. Processing may be slow on some devices." };
  }
  return {};
}

export function validateSelectionCount(
  currentCount: number,
  adding: number,
  maxFiles = MAX_FILES_PER_BATCH,
): string | undefined {
  if (currentCount + adding > maxFiles) {
    return maxFiles === 1 ? "This tool works with one file at a time." : `You can add up to ${maxFiles} files.`;
  }
  return undefined;
}

export function validateTotalSize(sizes: number[]): string | undefined {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total > MAX_TOTAL_SELECTION_BYTES) {
    return `The selected files exceed ${formatBytes(MAX_TOTAL_SELECTION_BYTES)} in total.`;
  }
  return undefined;
}
