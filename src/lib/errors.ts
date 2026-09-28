/**
 * User-facing error handling. Internal errors are mapped to a small set of safe,
 * friendly messages — stack traces, paths and library messages never reach the UI.
 */
export type ErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "TOO_FEW_FILES"
  | "EMPTY_FILE"
  | "CORRUPTED_PDF"
  | "ENCRYPTED_PDF"
  | "INVALID_OPTIONS"
  | "BROWSER_UNSUPPORTED"
  | "ENGINE_UNAVAILABLE"
  | "CANCELLED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "PROCESSING_FAILED";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_FORMAT: "This file format isn't supported.",
  FILE_TOO_LARGE: "This file exceeds the maximum supported size.",
  TOO_MANY_FILES: "Too many files selected for this tool.",
  TOO_FEW_FILES: "Please add more files for this tool.",
  EMPTY_FILE: "This file is empty.",
  CORRUPTED_PDF: "This PDF appears to be corrupted or invalid.",
  ENCRYPTED_PDF: "This PDF is password-protected. Unlock it first, then try again.",
  INVALID_OPTIONS: "Some settings are invalid. Please check them and try again.",
  BROWSER_UNSUPPORTED: "Your browser doesn't support this operation. Try a recent version of Chrome, Edge, Firefox or Safari.",
  ENGINE_UNAVAILABLE: "This tool needs a server engine that isn't configured on this deployment.",
  CANCELLED: "Processing was cancelled.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  NOT_FOUND: "The requested file is no longer available.",
  PROCESSING_FAILED: "We couldn't process this file. Please try again.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Safe, user-facing message. */
  readonly userMessage: string;

  constructor(code: ErrorCode, userMessage?: string, options?: { cause?: unknown }) {
    super(userMessage ?? ERROR_MESSAGES[code], options);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage ?? ERROR_MESSAGES[code];
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof AppError && error.code === "CANCELLED")
  );
}

/** Convert anything thrown into a safe AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isAbortError(error)) return new AppError("CANCELLED");
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (/Encrypted|password/i.test(name + message)) return new AppError("ENCRYPTED_PDF", undefined, { cause: error });
  if (/InvalidPDF|Failed to parse PDF|No PDF header|Invalid PDF/i.test(name + message)) {
    return new AppError("CORRUPTED_PDF", undefined, { cause: error });
  }
  return new AppError("PROCESSING_FAILED", undefined, { cause: error });
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AppError("CANCELLED");
}
