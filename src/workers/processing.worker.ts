/// <reference lib="webworker" />
import { toAppError } from "@/lib/errors";
import { BROWSER_PROCESSORS } from "@/services/processors/registry";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { processorId, files, options } = event.data;
  const post = (msg: WorkerResponse) => scope.postMessage(msg);
  try {
    const entry = BROWSER_PROCESSORS[processorId];
    if (!entry) throw new Error("unknown processor");
    const fn = await entry.load();
    const controller = new AbortController();
    const result = await fn(files, options, {
      signal: controller.signal,
      onProgress: (progress) => post({ type: "progress", progress }),
    });
    post({ type: "done", result });
  } catch (error) {
    const appError = toAppError(error);
    post({ type: "error", code: appError.code, message: appError.userMessage });
  }
};
