"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toAppError } from "@/lib/errors";
import type { ProcessingProgress, ProcessingState, ProcessResult } from "@/types/processing";

/**
 * Generic processing state machine (idle → running → done | error) with
 * cancellation and throttled progress. Knows nothing about what is processed.
 */
export function useProcessing() {
  const [state, setState] = useState<ProcessingState>({ phase: "idle" });
  const controller = useRef<AbortController | null>(null);
  const lastUpdate = useRef(0);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (task: (ctx: { signal: AbortSignal; onProgress: (p: ProcessingProgress) => void }) => Promise<ProcessResult>) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const startedAt = performance.now();
    setState({ phase: "running", progress: { ratio: 0, message: "Starting…" }, startedAt: Date.now() });
    try {
      const result = await task({
        signal: c.signal,
        onProgress: (progress) => {
          const now = performance.now();
          if (now - lastUpdate.current < 80 && (progress.ratio ?? 0) < 1) return;
          lastUpdate.current = now;
          if (!c.signal.aborted) setState((s) => (s.phase === "running" ? { ...s, progress } : s));
        },
      });
      if (c.signal.aborted) return null;
      setState({ phase: "done", result, durationMs: performance.now() - startedAt });
      return result;
    } catch (error) {
      const e = toAppError(error);
      if (e.code === "CANCELLED") {
        setState({ phase: "idle" });
        return null;
      }
      setState({ phase: "error", message: e.userMessage });
      return null;
    } finally {
      if (controller.current === c) controller.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState({ phase: "idle" });
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, cancel, reset };
}
