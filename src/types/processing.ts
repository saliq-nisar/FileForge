import type { InputFile, ProcessedFile } from "./files";

export interface ProcessingProgress {
  /** 0..1, or undefined when indeterminate. */
  ratio?: number;
  message?: string;
  step?: number;
  totalSteps?: number;
}

export interface ProcessContext {
  signal: AbortSignal;
  onProgress: (progress: ProcessingProgress) => void;
}

export interface ProcessResult {
  files: ProcessedFile[];
  /** Honest notes shown with the result, e.g. "File was already optimized". */
  notes?: string[];
  /** Text payload for tools that produce text (OCR, PDF to text). */
  text?: string;
}

export type ProcessorOptions = Record<string, unknown>;

/**
 * A processing engine for one tool operation. The UI never imports processors
 * directly — it goes through the processor registry / runner, so implementations
 * can move between browser, Web Worker and server without UI changes.
 */
export interface FileProcessor<O extends ProcessorOptions = ProcessorOptions> {
  process(inputs: InputFile[], options: O, ctx: ProcessContext): Promise<ProcessResult>;
}

export type JobStatus = "queued" | "uploading" | "processing" | "completed" | "failed" | "cancelled";

export interface ProcessingJob {
  id: string;
  toolSlug: string;
  status: JobStatus;
  progress: ProcessingProgress;
  inputNames: string[];
  inputSize: number;
  createdAt: number;
  finishedAt?: number;
  error?: string;
  result?: ProcessResult;
}

export type ProcessingState =
  | { phase: "idle" }
  | { phase: "running"; progress: ProcessingProgress; startedAt: number }
  | { phase: "done"; result: ProcessResult; durationMs: number }
  | { phase: "error"; message: string };

export interface CompressionOptions extends ProcessorOptions {
  level: "low" | "recommended" | "strong";
}

export interface ConversionOptions extends ProcessorOptions {
  targetFormat: string;
}
