import "server-only";
import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobResponse, ProcessRequest } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/errors";
import { FORMATS } from "@/lib/file/formats";
import { deriveFileName } from "@/lib/file/names";
import { getTool } from "@/lib/tools/registry";
import { bool, sanitizeOptions, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import type { ProcessorFn } from "@/services/processors/registry";
import { setFontBytesLoader } from "@/services/pdf/fonts";
import { engineAvailable, ghostscriptPdfA, libreofficeConvert, qpdfDecrypt, qpdfEncrypt, withWorkdir } from "../engines";
import { getJobStore, type ServerJob } from "../jobs/job-store";
import { logger } from "../logger";
import { authorize, type RequestIdentity } from "../security";
import { getStorage, type StoredFileMeta } from "../storage/temp-storage";

// Fonts for pdf-lib stamping on the server come from node_modules, not HTTP.
setFontBytesLoader(async (file) => {
  const path = file === "Geist-Regular.ttf"
    ? join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og", file)
    : join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts", file);
  const buf = await readFile(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
});

interface ServerOutput {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

type ServerProcessor = (files: StoredFileMeta[], options: ToolOptions, ctx: ProcessContext) => Promise<{ files: ServerOutput[]; notes?: string[] }>;

function asInputFile(meta: StoredFileMeta): InputFile {
  const storage = getStorage();
  return {
    name: meta.name,
    size: meta.size,
    type: meta.mime,
    arrayBuffer: async () => {
      const b = await storage.readBytes(meta.id);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
}

/** Reuse the isomorphic pdf-lib processors on the server. */
function pure(load: () => Promise<ProcessorFn>): ServerProcessor {
  return async (files, options, ctx) => {
    const fn = await load();
    const result: ProcessResult = await fn(files.map(asInputFile), options, ctx);
    const out = await Promise.all(result.files.map(async (f) => ({ name: f.name, mime: f.mime, bytes: new Uint8Array(await f.blob.arrayBuffer()) })));
    return { files: out, notes: result.notes };
  };
}

/** Copy the stored file into the workdir with a proper extension (engines rely on it). */
async function stage(dir: string, meta: StoredFileMeta): Promise<string> {
  const path = join(dir, `input.${FORMATS[meta.kind].ext}`);
  await copyFile(getStorage().pathOf(meta.id), path);
  return path;
}

const SERVER_PROCESSORS: Record<string, ServerProcessor> = {
  "pdf-merge": pure(() => import("@/services/pdf/pages").then((m) => m.mergePdfs)),
  "pdf-split": pure(() => import("@/services/pdf/pages").then((m) => m.splitPdf)),
  "pdf-rotate": pure(() => import("@/services/pdf/pages").then((m) => m.rotatePdf)),
  "pdf-pages": pure(() => import("@/services/pdf/pages").then((m) => m.editPages)),
  "pdf-watermark": pure(() => import("@/services/pdf/stamp").then((m) => m.watermarkPdf)),
  "pdf-page-numbers": pure(() => import("@/services/pdf/stamp").then((m) => m.addPageNumbers)),
  "pdf-header-footer": pure(() => import("@/services/pdf/stamp").then((m) => m.addHeaderFooter)),
  "pdf-crop": pure(() => import("@/services/pdf/transform").then((m) => m.cropPdf)),
  "pdf-resize": pure(() => import("@/services/pdf/transform").then((m) => m.resizePdf)),
  "pdf-metadata": pure(() => import("@/services/pdf/transform").then((m) => m.editMetadata)),
  "pdf-flatten": pure(() => import("@/services/pdf/transform").then((m) => m.flattenPdf)),
  "pdf-remove-watermark": pure(() => import("@/services/pdf/transform").then((m) => m.removeWatermark)),

  "engine-office-to-pdf": async (files, _o, ctx) => {
    const out: ServerOutput[] = [];
    for (let i = 0; i < files.length; i++) {
      ctx.onProgress({ ratio: i / files.length, message: `Converting ${files[i].name}` });
      out.push(
        await withWorkdir(async (dir) => ({
          name: deriveFileName(files[i].name, null, "pdf"),
          mime: "application/pdf",
          bytes: new Uint8Array(await readFile(await libreofficeConvert(dir, await stage(dir, files[i]), "pdf"))),
        })),
      );
    }
    return { files: out };
  },
  "engine-pdf-to-pptx": async (files) =>
    withWorkdir(async (dir) => ({
      files: [{
        name: deriveFileName(files[0].name, null, "pptx"),
        mime: FORMATS.pptx.mime,
        bytes: new Uint8Array(await readFile(await libreofficeConvert(dir, await stage(dir, files[0]), "pptx"))),
      }],
      notes: ["Each PDF page becomes a slide with editable text boxes where possible. Complex layouts may shift."],
    })),
  "engine-pdf-to-pdfa": async (files) =>
    withWorkdir(async (dir) => ({
      files: [{ name: deriveFileName(files[0].name, "pdfa", "pdf"), mime: "application/pdf", bytes: new Uint8Array(await readFile(await ghostscriptPdfA(dir, await stage(dir, files[0])))) }],
      notes: ["Converted to PDF/A-2b. Use a validator such as veraPDF if you need certified compliance."],
    })),
  "engine-pdf-protect": async (files, options) => {
    const password = str(options, "password");
    if (password.length < 8) throw new AppError("INVALID_OPTIONS", "Use a password with at least 8 characters.");
    return withWorkdir(async (dir) => ({
      files: [{
        name: deriveFileName(files[0].name, "protected", "pdf"),
        mime: "application/pdf",
        bytes: new Uint8Array(await readFile(await qpdfEncrypt(dir, await stage(dir, files[0]), password, { print: bool(options, "allowPrint", true), copy: bool(options, "allowCopy") }))),
      }],
    }));
  },
  "engine-pdf-unlock": async (files, options) => {
    const password = str(options, "password");
    if (!password) throw new AppError("INVALID_OPTIONS", "Enter the PDF's current password.");
    return withWorkdir(async (dir) => ({
      files: [{
        name: deriveFileName(files[0].name, "unlocked", "pdf"),
        mime: "application/pdf",
        bytes: new Uint8Array(await readFile(await qpdfDecrypt(dir, await stage(dir, files[0]), password))),
      }],
    }));
  },
};

export function serverSupports(processor: string | undefined): boolean {
  return Boolean(processor && Object.hasOwn(SERVER_PROCESSORS, processor));
}

/** Validate a process request and start a background job. */
export async function createProcessingJob(req: ProcessRequest, identity: RequestIdentity): Promise<string> {
  const tool = typeof req.toolSlug === "string" ? getTool(req.toolSlug) : undefined;
  if (!tool || !tool.processor || !serverSupports(tool.processor) || tool.status === "unavailable") throw new AppError("INVALID_OPTIONS", "This tool can't run on the server.");
  if (tool.engine && !engineAvailable(tool.engine)) throw new AppError("ENGINE_UNAVAILABLE");
  if (!Array.isArray(req.fileIds) || req.fileIds.length === 0) throw new AppError("TOO_FEW_FILES");
  const max = Math.min(tool.maxFiles ?? (tool.multiple ? 20 : 1), 20);
  if (req.fileIds.length > max) throw new AppError("TOO_MANY_FILES");
  if (req.fileIds.length < (tool.minFiles ?? 1)) throw new AppError("TOO_FEW_FILES");

  const storage = getStorage();
  const metas: StoredFileMeta[] = [];
  for (const id of req.fileIds) {
    if (typeof id !== "string") throw new AppError("NOT_FOUND");
    const meta = await storage.getMeta(id);
    if (!meta) throw new AppError("NOT_FOUND");
    await authorize(identity, "process", meta.owner);
    if (!tool.accept.includes(meta.kind)) throw new AppError("UNSUPPORTED_FORMAT");
    metas.push(meta);
  }
  const options = sanitizeOptions(tool, req.options && typeof req.options === "object" ? req.options : {});
  const job = getJobStore().create(identity.key, tool.slug);
  void execute(job, tool.processor, metas, options);
  return job.id;
}

async function execute(job: ServerJob, processorId: string, files: StoredFileMeta[], options: ToolOptions): Promise<void> {
  const store = getJobStore();
  const storage = getStorage();
  store.update(job.id, { status: "processing" });
  const controller = new AbortController();
  try {
    const result = await SERVER_PROCESSORS[processorId](files, options, {
      signal: controller.signal,
      onProgress: (progress) => store.update(job.id, { progress }),
    });
    const saved = [];
    for (const f of result.files) {
      const kindEntry = Object.entries(FORMATS).find(([, v]) => v.mime === f.mime);
      const meta = await storage.saveBytes(f.bytes, { name: f.name, kind: (kindEntry?.[0] ?? "unknown") as StoredFileMeta["kind"], mime: f.mime, owner: job.owner });
      saved.push({ id: meta.id, name: meta.name, size: meta.size, mime: meta.mime });
    }
    store.update(job.id, { status: "completed", progress: { ratio: 1 }, finishedAt: Date.now(), result: { files: saved, notes: result.notes } });
  } catch (error) {
    const e = toAppError(error);
    logger.warn("job failed", { jobId: job.id, code: e.code });
    store.update(job.id, { status: "failed", error: e.userMessage, finishedAt: Date.now() });
  }
}

export async function getJobForOwner(id: string, identity: RequestIdentity): Promise<JobResponse> {
  const job = getJobStore().get(id);
  if (!job) throw new AppError("NOT_FOUND");
  await authorize(identity, "read-job", job.owner);
  return { id: job.id, status: job.status, progress: job.progress, error: job.error, result: job.result };
}
