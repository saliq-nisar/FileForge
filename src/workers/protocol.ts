import type { ErrorCode } from "@/lib/errors";
import type { ToolOptions } from "@/lib/validation/options";
import type { ProcessingProgress, ProcessResult } from "@/types/processing";

export interface WorkerRequest {
  processorId: string;
  files: File[];
  options: ToolOptions;
}

export type WorkerResponse =
  | { type: "progress"; progress: ProcessingProgress }
  | { type: "done"; result: ProcessResult }
  | { type: "error"; code: ErrorCode; message: string };
