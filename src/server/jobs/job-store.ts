import "server-only";
import { randomUUID } from "node:crypto";
import type { JobResultFile } from "@/lib/api/contracts";
import type { JobStatus, ProcessingProgress } from "@/types/processing";

export interface ServerJob {
  id: string;
  owner: string;
  toolSlug: string;
  status: JobStatus;
  progress: ProcessingProgress;
  createdAt: number;
  finishedAt?: number;
  error?: string;
  result?: { files: JobResultFile[]; notes?: string[] };
}

/**
 * Job store abstraction. The in-memory default suits a single long-running
 * server (`next start`). Swap for Redis/DB-backed storage and a queue worker
 * when running multiple instances or serverless.
 */
export interface JobStore {
  create(owner: string, toolSlug: string): ServerJob;
  get(id: string): ServerJob | undefined;
  update(id: string, patch: Partial<ServerJob>): void;
}

const JOB_TTL_MS = 2 * 60 * 60_000;

class MemoryJobStore implements JobStore {
  private jobs = new Map<string, ServerJob>();

  create(owner: string, toolSlug: string): ServerJob {
    this.prune();
    const job: ServerJob = { id: randomUUID(), owner, toolSlug, status: "queued", progress: { ratio: 0 }, createdAt: Date.now() };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): ServerJob | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<ServerJob>): void {
    const job = this.jobs.get(id);
    if (job) Object.assign(job, patch);
  }

  private prune(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) if (job.createdAt < cutoff) this.jobs.delete(id);
  }
}

const g = globalThis as unknown as { __ffJobs?: JobStore };

export function getJobStore(): JobStore {
  return (g.__ffJobs ??= new MemoryJobStore());
}
