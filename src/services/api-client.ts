import type {
  ApiErrorBody,
  CapabilitiesResponse,
  JobResponse,
  ProcessRequest,
  ProcessResponse,
  UploadResponse,
} from "@/lib/api/contracts";
import { AppError, ERROR_MESSAGES, type ErrorCode } from "@/lib/errors";

async function parseError(res: Response): Promise<AppError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error?.code) {
      const code = body.error.code in ERROR_MESSAGES ? body.error.code : "PROCESSING_FAILED";
      return new AppError(code as ErrorCode, body.error.message);
    }
  } catch {
    /* non-JSON error */
  }
  if (res.status === 429) return new AppError("RATE_LIMITED");
  if (res.status === 413) return new AppError("FILE_TOO_LARGE");
  if (res.status === 404) return new AppError("NOT_FOUND");
  return new AppError("PROCESSING_FAILED");
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

let capabilities: Promise<CapabilitiesResponse> | null = null;

export function getCapabilities(): Promise<CapabilitiesResponse> {
  if (!capabilities) {
    capabilities = fetch("/api/capabilities", { cache: "no-store" }).then((r) => json<CapabilitiesResponse>(r));
    capabilities.catch(() => (capabilities = null));
  }
  return capabilities;
}

/** Upload with progress (XHR gives upload progress events; fetch does not). */
export function uploadFile(file: File, onProgress: (ratio: number) => void, signal: AbortSignal): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const res = new Response(xhr.responseText, { status: xhr.status, headers: { "content-type": "application/json" } });
      json<UploadResponse>(res).then(resolve, reject);
    };
    xhr.onerror = () => reject(new AppError("PROCESSING_FAILED", "Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new AppError("CANCELLED"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export async function startJob(req: ProcessRequest, signal: AbortSignal): Promise<ProcessResponse> {
  return json(await fetch("/api/files/process", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal }));
}

export async function getJob(id: string, signal: AbortSignal): Promise<JobResponse> {
  return json(await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store", signal }));
}

export async function downloadServerFile(id: string, signal: AbortSignal): Promise<Blob> {
  const res = await fetch(`/api/files/${encodeURIComponent(id)}/download`, { signal });
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

export async function deleteServerFile(id: string): Promise<void> {
  await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
}
