import type { ErrorCode } from "@/lib/errors";
import type { FileKind } from "@/types/files";
import type { JobStatus, ProcessingProgress } from "@/types/processing";
import type { EngineId } from "@/types/tools";

/** Typed contracts shared by the API route handlers and the browser client. */

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

/** POST /api/files/upload — raw body, headers: x-file-name (URI-encoded). */
export interface UploadResponse {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  mime: string;
  expiresAt: number;
}

/** POST /api/files/process */
export interface ProcessRequest {
  toolSlug: string;
  fileIds: string[];
  options: Record<string, unknown>;
}

export interface ProcessResponse {
  jobId: string;
}

export interface JobResultFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}

/** GET /api/jobs/:id */
export interface JobResponse {
  id: string;
  status: JobStatus;
  progress: ProcessingProgress;
  error?: string;
  result?: { files: JobResultFile[]; notes?: string[] };
}

/** GET /api/capabilities */
export interface CapabilitiesResponse {
  engines: Record<EngineId, boolean>;
  maxUploadBytes: number;
  tempFileTtlMinutes: number;
  ai: boolean;
}

/** GET /api/health */
export interface HealthResponse {
  status: "ok";
  time: string;
  uptimeSeconds: number;
}
