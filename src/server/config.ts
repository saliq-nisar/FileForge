import "server-only";
import type { EngineId } from "@/types/tools";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Server-only configuration. Everything is optional; defaults allow zero-config startup. */
export const serverConfig = {
  maxUploadBytes: intEnv("MAX_UPLOAD_MB", 200, 1, 4096) * 1_000_000,
  tempFileTtlMs: intEnv("TEMP_FILE_TTL_MINUTES", 60, 5, 24 * 60) * 60_000,
  maxFilesPerJob: 20,
  engineTimeoutMs: 120_000,
  enginePaths: {
    libreoffice: process.env.LIBREOFFICE_PATH?.trim() || undefined,
    qpdf: process.env.QPDF_PATH?.trim() || undefined,
    ghostscript: process.env.GHOSTSCRIPT_PATH?.trim() || undefined,
  } satisfies Record<EngineId, string | undefined>,
  /** Optional AI layer: only read when an AI feature is invoked. */
  ai: {
    provider: process.env.AI_PROVIDER?.trim() || undefined,
  },
};
