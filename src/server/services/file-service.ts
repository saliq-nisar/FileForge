import "server-only";
import { open } from "node:fs/promises";
import type { UploadResponse } from "@/lib/api/contracts";
import { AppError } from "@/lib/errors";
import { refineZipKind, sniffKind, looksLikeText } from "@/lib/file/detect";
import { FORMATS, getExtension, kindFromExtension } from "@/lib/file/formats";
import { sanitizeFileName } from "@/lib/file/names";
import { extensionMatches } from "@/lib/validation/files";
import type { FileKind } from "@/types/files";
import { serverConfig } from "../config";
import { logger } from "../logger";
import { malwareScanner, type RequestIdentity } from "../security";
import { getStorage } from "../storage/temp-storage";

async function readHead(path: string, bytes: number): Promise<Uint8Array> {
  const fh = await open(path, "r");
  try {
    const buf = new Uint8Array(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Server-side detection from content. Client name/type/size are never trusted. */
async function detectStoredKind(path: string, name: string, size: number): Promise<FileKind> {
  const head = await readHead(path, 8192);
  const sniffed = sniffKind(head.subarray(0, 1024));
  if (sniffed === "zip-container") {
    if (size > 300_000_000) return "zip";
    const { readFile } = await import("node:fs/promises");
    return refineZipKind(await readFile(path));
  }
  if (sniffed) return sniffed;
  if (looksLikeText(head)) return kindFromExtension(getExtension(name)) === "csv" ? "csv" : "text";
  return "unknown";
}

export async function handleUpload(req: Request, identity: RequestIdentity): Promise<UploadResponse> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > serverConfig.maxUploadBytes) throw new AppError("FILE_TOO_LARGE");
  if (!req.body) throw new AppError("EMPTY_FILE");

  let rawName = "file";
  try {
    rawName = decodeURIComponent(req.headers.get("x-file-name") ?? "file");
  } catch {
    /* malformed header: keep default */
  }
  const name = sanitizeFileName(rawName);
  const storage = getStorage();
  const stored = await storage.saveStream(req.body, { name, owner: identity.key }, serverConfig.maxUploadBytes);
  try {
    if (stored.size === 0) throw new AppError("EMPTY_FILE");
    const kind = await detectStoredKind(stored.path, name, stored.size);
    if (kind === "unknown") throw new AppError("UNSUPPORTED_FORMAT");
    const format = { kind, family: FORMATS[kind].family, mime: FORMATS[kind].mime, ext: FORMATS[kind].ext, label: FORMATS[kind].label };
    if (!extensionMatches(name, format)) throw new AppError("UNSUPPORTED_FORMAT", "This file's extension doesn't match its contents.");
    const scan = await malwareScanner.scan(stored.path);
    if (!scan.clean) throw new AppError("UNSUPPORTED_FORMAT", "This file was rejected by the security scanner.");
    const meta = { ...stored, kind, mime: format.mime };
    await storage.updateMeta({ id: meta.id, name: meta.name, size: meta.size, kind, mime: meta.mime, createdAt: meta.createdAt, expiresAt: meta.expiresAt, owner: meta.owner });
    logger.info("upload stored", { id: meta.id, kind, size: meta.size });
    return { id: meta.id, name: meta.name, size: meta.size, kind, mime: meta.mime, expiresAt: meta.expiresAt };
  } catch (error) {
    await storage.delete(stored.id);
    throw error;
  }
}
