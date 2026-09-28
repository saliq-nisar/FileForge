import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";

/* ------------------------------------------------------------------
   Integration points for production hardening. Defaults are safe for a
   single-instance deployment; replace implementations as you scale.
------------------------------------------------------------------- */

// ---------- Identity / authentication hook ----------
export interface RequestIdentity {
  /** Stable key for the requester: user id when auth exists, else hashed client address. */
  key: string;
  userId?: string;
}

export function clientAddress(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

/** No accounts yet: identify anonymously. Plug an auth provider in here later. */
export async function identify(req: Request): Promise<RequestIdentity> {
  const hash = createHash("sha256").update(clientAddress(req)).digest("hex").slice(0, 24);
  return { key: `anon:${hash}` };
}

// ---------- Authorization hook ----------
export type Action = "upload" | "process" | "read-job" | "download" | "delete";

/** Owners may only touch their own files and jobs. */
export async function authorize(identity: RequestIdentity, action: Action, resourceOwner?: string): Promise<void> {
  if (resourceOwner !== undefined && resourceOwner !== identity.key) throw new AppError("NOT_FOUND");
  void action;
}

// ---------- Rate limiting hook ----------
interface Bucket {
  tokens: number;
  updated: number;
}

const LIMITS: Record<Action, { capacity: number; perSecond: number }> = {
  upload: { capacity: 30, perSecond: 0.5 },
  process: { capacity: 30, perSecond: 0.5 },
  "read-job": { capacity: 240, perSecond: 4 },
  download: { capacity: 120, perSecond: 2 },
  delete: { capacity: 120, perSecond: 2 },
};

const g = globalThis as unknown as { __ffBuckets?: Map<string, Bucket> };
const buckets = (g.__ffBuckets ??= new Map());

/**
 * In-memory token bucket per identity and action. For multi-instance deployments
 * replace with a shared store (e.g. Redis) behind the same function.
 */
export function rateLimit(identity: RequestIdentity, action: Action): void {
  const { capacity, perSecond } = LIMITS[action];
  const key = `${action}:${identity.key}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, updated: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.updated) / 1000) * perSecond);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new AppError("RATE_LIMITED");
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) buckets.clear(); // bounded memory
}

// ---------- Malware scanning hook ----------
export interface ScanResult {
  clean: boolean;
  scanned: boolean;
}

export interface MalwareScanner {
  scan(path: string): Promise<ScanResult>;
}

/**
 * No scanner is bundled. Files are never executed and only parsed by
 * format-specific libraries, but a ClamAV/ICAP scanner can be plugged in here.
 */
export const malwareScanner: MalwareScanner = {
  async scan() {
    return { clean: true, scanned: false };
  },
};
