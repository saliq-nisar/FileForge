import { AppError, toAppError } from "@/lib/errors";
import { sanitizeOptions, type ToolOptions } from "@/lib/validation/options";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import type { ToolDefinition } from "@/types/tools";
import type { WorkerRequest, WorkerResponse } from "@/workers/protocol";
import { deleteServerFile, downloadServerFile, getJob, startJob, uploadFile } from "./api-client";
import { BROWSER_PROCESSORS } from "./processors/registry";
import { toProcessedFile } from "./shared/output";

/**
 * The single entry point the UI uses to run a tool. It decides where the work
 * happens — Web Worker, main thread or server job — so components never depend
 * on processing implementations.
 */
export async function runTool(tool: ToolDefinition, files: File[], rawOptions: Record<string, unknown>, ctx: ProcessContext): Promise<ProcessResult> {
  if (!tool.processor) throw new AppError("PROCESSING_FAILED");
  const options = sanitizeOptions(tool, rawOptions);
  try {
    if (tool.runtime === "server") return await runOnServer(tool, files, options, ctx);
    const entry = BROWSER_PROCESSORS[tool.processor];
    if (!entry) throw new AppError("PROCESSING_FAILED");
    if (entry.thread === "worker" && canUseWorker()) {
      return await runInWorker(tool.processor, files, options, ctx);
    }
    const fn = await entry.load();
    return await fn(files, options, ctx);
  } catch (error) {
    throw toAppError(error);
  }
}

function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

function runInWorker(processorId: string, files: File[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/processing.worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      worker.terminate();
      ctx.signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new AppError("CANCELLED"));
    };
    if (ctx.signal.aborted) return onAbort();
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") ctx.onProgress(msg.progress);
      else if (msg.type === "done") {
        finish();
        resolve(msg.result);
      } else {
        finish();
        reject(new AppError(msg.code, msg.message));
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      finish();
      reject(new AppError("PROCESSING_FAILED"));
    };
    const request: WorkerRequest = { processorId, files, options };
    worker.postMessage(request);
  });
}

const POLL_MS = 800;

async function runOnServer(tool: ToolDefinition, files: File[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const uploaded: string[] = [];
  const results: string[] = [];
  const total = files.reduce((a, f) => a + f.size, 0) || 1;
  let sent = 0;
  try {
    for (const file of files) {
      const res = await uploadFile(
        file,
        (r) => ctx.onProgress({ ratio: ((sent + r * file.size) / total) * 0.4, message: `Uploading ${file.name}` }),
        ctx.signal,
      );
      sent += file.size;
      uploaded.push(res.id);
    }
    ctx.onProgress({ ratio: 0.42, message: "Queued for processing" });
    const { jobId } = await startJob({ toolSlug: tool.slug, fileIds: uploaded, options }, ctx.signal);
    for (;;) {
      if (ctx.signal.aborted) throw new AppError("CANCELLED");
      await new Promise((r) => setTimeout(r, POLL_MS));
      const job = await getJob(jobId, ctx.signal);
      if (job.status === "failed") throw new AppError("PROCESSING_FAILED", job.error);
      if (job.status === "completed" && job.result) {
        ctx.onProgress({ ratio: 0.95, message: "Downloading result" });
        const out = [];
        for (const f of job.result.files) {
          results.push(f.id);
          out.push(toProcessedFile(f.name, f.mime, await downloadServerFile(f.id, ctx.signal)));
        }
        return { files: out, notes: job.result.notes };
      }
      ctx.onProgress({ ratio: 0.42 + (job.progress.ratio ?? 0) * 0.5, message: job.progress.message ?? "Processing" });
    }
  } finally {
    // Files are deleted from the server as soon as we have the result (they also expire automatically).
    for (const id of [...uploaded, ...results]) void deleteServerFile(id);
  }
}
