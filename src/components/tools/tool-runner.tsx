"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Play, Server } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileList } from "@/components/files/file-list";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, Notice } from "@/components/ui/misc";
import { useFileSelection } from "@/hooks/use-file-selection";
import { useProcessing } from "@/hooks/use-processing";
import { BROWSER_MAX_BYTES } from "@/lib/constants/limits";
import { FORMATS } from "@/lib/file/formats";
import { defaultOptions, getTool } from "@/lib/tools/registry";
import type { ToolOptions } from "@/lib/validation/options";
import { useSettings, type UserPreferences } from "@/stores/settings-store";
import { toast } from "@/stores/toast-store";
import { useWorkspace } from "@/stores/workspace-store";
import type { ToolDefinition } from "@/types/tools";
import { OptionFields } from "./option-fields";
import { ProcessingPanel } from "./processing-panel";
import { ResultPanel } from "./result-panel";

const ENGINE_LABEL = { libreoffice: "LibreOffice", qpdf: "qpdf", ghostscript: "Ghostscript" } as const;

function initialValues(tool: ToolDefinition, prefs: UserPreferences): ToolOptions {
  const v = defaultOptions(tool);
  const keys = new Set((tool.options ?? []).map((o) => o.key));
  if (keys.has("level")) v.level = prefs.defaultCompressionLevel;
  if (tool.processor === "image-compress") {
    if (keys.has("quality")) v.quality = prefs.defaultImageQuality;
    if (keys.has("format")) v.format = prefs.defaultImageFormat;
  }
  return { ...v, ...tool.preset };
}

function progressVerb(tool: ToolDefinition): string {
  const n = tool.name.toLowerCase();
  if (n.startsWith("compress")) return `Compressing ${tool.name.replace(/^Compress /i, "")}`;
  if (n.startsWith("merge")) return "Merging PDFs";
  if (n.startsWith("split")) return "Splitting PDF";
  if (/ to /.test(tool.name)) return `Converting ${tool.name}`;
  return `${tool.name} in progress`;
}

export function ToolRunner({ slug }: { slug: string }) {
  const tool = getTool(slug)!;
  const prefs = useSettings();
  const record = useWorkspace((s) => s.record);
  const multiple = Boolean(tool.multiple);
  const rules = useMemo(() => ({ accept: tool.accept, maxFiles: tool.maxFiles, multiple }), [tool, multiple]);
  const selection = useFileSelection(rules);
  const { state, run, cancel, reset } = useProcessing();
  // Values = saved defaults (which load from storage after mount) + what the user changed.
  const [overrides, setOverrides] = useState<ToolOptions>({});
  const values = useMemo(() => ({ ...initialValues(tool, prefs), ...overrides, ...tool.preset }), [tool, prefs, overrides]);
  const [engineReady, setEngineReady] = useState<boolean | null>(tool.status === "engine" ? null : true);

  useEffect(() => {
    if (tool.status !== "engine" || !tool.engine) return;
    import("@/services/api-client")
      .then(({ getCapabilities }) => getCapabilities())
      .then((c) => setEngineReady(Boolean(c.engines[tool.engine!])))
      .catch(() => setEngineReady(false));
  }, [tool]);

  // Prefill options from the file where the tool supports it (e.g. current PDF metadata).
  const first = selection.files[0];
  useEffect(() => {
    if (tool.processor !== "pdf-metadata" || !first) return;
    let cancelled = false;
    import("@/services/pdf/transform")
      .then((m) => m.readPdfMetadata(first.file))
      .then((meta) => !cancelled && setOverrides((v) => ({ ...v, ...meta })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tool.processor, first]);

  const onFiles = useCallback((files: File[]) => void selection.add(files), [selection]);

  const minFiles = tool.minFiles ?? 1;
  const canRun = selection.files.length >= minFiles && state.phase !== "running" && engineReady === true;

  const start = async () => {
    const inputs = selection.files.map((f) => f.file);
    if (inputs.length > 1) toast.info(`Processing ${inputs.length} files…`);
    const result = await run(async (ctx) => {
      const { runTool } = await import("@/services/runner");
      return runTool(tool, inputs, values, ctx);
    });
    if (result) {
      toast.success(`${tool.resultLabel ?? "File"} ready.`);
      void record(tool, inputs, result);
    }
  };

  if (tool.status === "unavailable") {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <ErrorState title="Not available yet" message={tool.note ?? "This tool isn't available yet."} />
      </div>
    );
  }

  const maxBytes = BROWSER_MAX_BYTES[FORMATS[tool.accept[0]]?.family ?? "other"];
  const showSizes = tool.category === "compression" || Boolean(tool.alsoIn?.includes("compression"));
  const inputs = selection.files.map((f) => f.file);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {tool.status === "engine" && engineReady === null && <LoadingState label="Checking server engine…" />}
        {tool.status === "engine" && engineReady === false && (
          <Notice tone="warning" title="This tool isn't enabled on this deployment">
            It needs {ENGINE_LABEL[tool.engine!]} installed on the server. Administrators can enable it by setting the engine path in the server configuration. Nothing will be uploaded while it&apos;s unavailable.
          </Notice>
        )}

        {state.phase === "running" ? (
          <ProcessingPanel title={progressVerb(tool)} progress={state.progress} startedAt={state.startedAt} fileNames={inputs.map((f) => f.name)} onCancel={cancel} />
        ) : state.phase === "done" ? (
          <ResultPanel
            result={state.result}
            inputs={inputs}
            label={tool.resultLabel ?? "File"}
            showSizes={showSizes}
            serverProcessed={tool.runtime === "server"}
            onReset={() => {
              reset();
              selection.clear();
            }}
          />
        ) : (
          <>
            {state.phase === "error" && (
              <Notice tone="danger" title="Processing failed">
                {state.message}
              </Notice>
            )}
            {(multiple || selection.files.length === 0) && (
              <FileDropzone accept={tool.accept} multiple={multiple} onFiles={onFiles} busy={selection.validating} maxBytes={maxBytes} compact={selection.files.length > 0} title={selection.files.length > 0 ? "Add more files" : undefined} />
            )}
            {selection.files.length > 0 && (
              <FileList files={selection.files} onRemove={selection.remove} onReorder={selection.reorder} orderable={multiple && tool.processor !== "zip-create"} />
            )}
            {selection.files.length > 0 && selection.files.length < minFiles && <p className="text-sm text-muted">Add at least {minFiles} files to continue.</p>}
          </>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Options</h2>
          {tool.options?.length ? (
            <OptionFields fields={tool.options} values={values} onChange={(k, v) => setOverrides((s) => ({ ...s, [k]: v }))} disabled={state.phase === "running"} />
          ) : (
            <p className="text-sm text-muted">No settings needed — just add your file{multiple ? "s" : ""}.</p>
          )}
          {state.phase !== "done" && (
            <Button size="lg" className="mt-6 w-full" disabled={!canRun} loading={state.phase === "running"} icon={<Play className="size-4" />} onClick={start}>
              {state.phase === "error" ? "Try again" : tool.name}
            </Button>
          )}
        </div>
        {tool.note && <Notice tone="info">{tool.note}</Notice>}
        <div className="flex items-start gap-2.5 rounded-lg px-1 text-xs leading-relaxed text-muted">
          {tool.runtime === "server" ? <Server className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Cpu className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />}
          {tool.runtime === "server"
            ? "Runs on the server: your file is uploaded over HTTPS, processed, and deleted right after you receive the result (or automatically within the retention window)."
            : "Runs in your browser. Your files never leave this device."}
        </div>
      </aside>
    </div>
  );
}
