import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "@/lib/errors";
import type { FileKind } from "@/types/files";
import { serverConfig } from "../config";
import { logger } from "../logger";

export interface StoredFileMeta {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  mime: string;
  createdAt: number;
  expiresAt: number;
  /** Owner key (session / user id) for authorization hooks. */
  owner: string;
}

/**
 * Storage abstraction. The default keeps files in the OS temp directory and
 * deletes them after the TTL. A cloud implementation (S3, GCS, …) can replace
 * it without touching routes or services.
 */
export interface StorageProvider {
  saveStream(body: ReadableStream<Uint8Array>, meta: Omit<StoredFileMeta, "id" | "size" | "createdAt" | "expiresAt" | "kind" | "mime">, maxBytes: number): Promise<StoredFileMeta & { path: string }>;
  saveBytes(bytes: Uint8Array, meta: Omit<StoredFileMeta, "id" | "size" | "createdAt" | "expiresAt">): Promise<StoredFileMeta>;
  updateMeta(meta: StoredFileMeta): Promise<void>;
  getMeta(id: string): Promise<StoredFileMeta | null>;
  pathOf(id: string): string;
  openStream(id: string): ReadableStream<Uint8Array>;
  readBytes(id: string): Promise<Uint8Array>;
  delete(id: string): Promise<void>;
  cleanupExpired(): Promise<number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IDs are server-generated UUIDs; anything else is rejected (prevents path traversal). */
export function assertValidId(id: string): void {
  if (!UUID.test(id)) throw new AppError("NOT_FOUND");
}

class LocalTempStorage implements StorageProvider {
  private readonly root = join(tmpdir(), "fileforge");

  private dir(id: string): string {
    assertValidId(id);
    return join(this.root, id);
  }

  pathOf(id: string): string {
    return join(this.dir(id), "data");
  }

  async saveStream(body: ReadableStream<Uint8Array>, meta: { name: string; owner: string }, maxBytes: number) {
    const id = randomUUID();
    const dir = this.dir(id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "data");
    let size = 0;
    const limiter = async function* (source: AsyncIterable<Uint8Array>) {
      for await (const chunk of source) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new AppError("FILE_TOO_LARGE");
        yield chunk;
      }
    };
    try {
      await pipeline(Readable.fromWeb(body as never), limiter, createWriteStream(path, { mode: 0o600 }));
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      throw error;
    }
    const now = Date.now();
    const full: StoredFileMeta = { id, name: meta.name, owner: meta.owner, size, kind: "unknown", mime: "application/octet-stream", createdAt: now, expiresAt: now + serverConfig.tempFileTtlMs };
    await this.updateMeta(full);
    return { ...full, path };
  }

  async saveBytes(bytes: Uint8Array, meta: Omit<StoredFileMeta, "id" | "size" | "createdAt" | "expiresAt">) {
    const id = randomUUID();
    const dir = this.dir(id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, "data"), bytes, { mode: 0o600 });
    const now = Date.now();
    const full: StoredFileMeta = { ...meta, id, size: bytes.byteLength, createdAt: now, expiresAt: now + serverConfig.tempFileTtlMs };
    await this.updateMeta(full);
    return full;
  }

  async updateMeta(meta: StoredFileMeta): Promise<void> {
    await writeFile(join(this.dir(meta.id), "meta.json"), JSON.stringify(meta), { mode: 0o600 });
  }

  async getMeta(id: string): Promise<StoredFileMeta | null> {
    try {
      const meta = JSON.parse(await readFile(join(this.dir(id), "meta.json"), "utf8")) as StoredFileMeta;
      if (meta.expiresAt < Date.now()) {
        await this.delete(id);
        return null;
      }
      return meta;
    } catch {
      return null;
    }
  }

  openStream(id: string): ReadableStream<Uint8Array> {
    return Readable.toWeb(createReadStream(this.pathOf(id))) as unknown as ReadableStream<Uint8Array>;
  }

  async readBytes(id: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathOf(id)));
  }

  async delete(id: string): Promise<void> {
    await rm(this.dir(id), { recursive: true, force: true });
  }

  async cleanupExpired(): Promise<number> {
    let removed = 0;
    let entries: string[] = [];
    try {
      entries = await readdir(this.root);
    } catch {
      return 0;
    }
    for (const id of entries) {
      if (!UUID.test(id)) continue;
      try {
        const meta = JSON.parse(await readFile(join(this.root, id, "meta.json"), "utf8")) as StoredFileMeta;
        if (meta.expiresAt < Date.now()) {
          await this.delete(id);
          removed++;
        }
      } catch {
        // Orphaned directory (e.g. crashed upload): remove once it's older than the TTL.
        const s = await stat(join(this.root, id)).catch(() => null);
        if (s && Date.now() - s.mtimeMs > serverConfig.tempFileTtlMs) {
          await rm(join(this.root, id), { recursive: true, force: true });
          removed++;
        }
      }
    }
    if (removed) logger.info("temp cleanup", { removed });
    return removed;
  }
}

const globalStore = globalThis as unknown as { __ffStorage?: StorageProvider; __ffCleanup?: NodeJS.Timeout };

export function getStorage(): StorageProvider {
  if (!globalStore.__ffStorage) {
    globalStore.__ffStorage = new LocalTempStorage();
    // Periodic cleanup of expired temporary files.
    globalStore.__ffCleanup = setInterval(() => void globalStore.__ffStorage?.cleanupExpired(), 5 * 60_000);
    globalStore.__ffCleanup.unref?.();
  }
  return globalStore.__ffStorage;
}
