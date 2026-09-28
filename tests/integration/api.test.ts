import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { GET as capabilities } from "@/app/api/capabilities/route";
import { DELETE as deleteFile } from "@/app/api/files/[id]/route";
import { GET as download } from "@/app/api/files/[id]/download/route";
import { POST as processFiles } from "@/app/api/files/process/route";
import { POST as upload } from "@/app/api/files/upload/route";
import { GET as health } from "@/app/api/health/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import type { JobResponse, UploadResponse } from "@/lib/api/contracts";
import { makePdf } from "../helpers";

const ip = `10.0.0.${Math.floor(Math.random() * 200)}`;
const headers = (extra: Record<string, string> = {}) => ({ "x-forwarded-for": ip, ...extra });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;

async function uploadBytes(bytes: Uint8Array | string, name: string, from = ip) {
  return upload(new Request("http://test/api/files/upload", { method: "POST", body: bytes as BodyInit, headers: { "x-forwarded-for": from, "x-file-name": encodeURIComponent(name) }, duplex: "half" } as RequestInit), undefined as never);
}

async function waitForJob(id: string): Promise<JobResponse> {
  for (let i = 0; i < 100; i++) {
    const res = await getJob(new Request(`http://test/api/jobs/${id}`, { headers: headers() }), params({ id }));
    const job = (await res.json()) as JobResponse;
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("job timeout");
}

describe("API: health and capabilities", () => {
  it("reports health and optional engines without exposing configuration", async () => {
    expect((await (await health()).json()).status).toBe("ok");
    const caps = await (await capabilities()).json();
    expect(caps.engines).toEqual({ libreoffice: false, qpdf: false, ghostscript: false });
    expect(caps.ai).toBe(false);
  });
});

describe("API: upload → process → job → download → delete", () => {
  it("merges two uploaded PDFs on the server", async () => {
    const a = (await (await uploadBytes(await makePdf(2), "a.pdf")).json()) as UploadResponse;
    const b = (await (await uploadBytes(await makePdf(1), "b.pdf")).json()) as UploadResponse;
    expect(a.kind).toBe("pdf");
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);

    const res = await processFiles(new Request("http://test/api/files/process", { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ toolSlug: "merge-pdf", fileIds: [a.id, b.id], options: {} }) }), undefined as never);
    expect(res.status).toBe(202);
    const { jobId } = await res.json();
    const job = await waitForJob(jobId);
    expect(job.status).toBe("completed");
    const out = job.result!.files[0];

    const dl = await download(new Request(`http://test/api/files/${out.id}/download`, { headers: headers() }), params({ id: out.id }));
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    expect(dl.headers.get("content-disposition")).toContain("attachment");
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    const merged = await PDFDocument.load(new Uint8Array(await dl.arrayBuffer()));
    expect(merged.getPageCount()).toBe(3);

    const del = await deleteFile(new Request(`http://test/api/files/${out.id}`, { method: "DELETE", headers: headers() }), params({ id: out.id }));
    expect(del.status).toBe(204);
    const again = await download(new Request(`http://test/api/files/${out.id}/download`, { headers: headers() }), params({ id: out.id }));
    expect(again.status).toBe(404);
  });
});

describe("API: error handling", () => {
  it("rejects unsupported content regardless of the file name", async () => {
    const res = await uploadBytes(Uint8Array.from([0, 1, 2, 3, 0, 255]), "evil.pdf");
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.message).toBe("This file format isn't supported.");
    expect(JSON.stringify(body)).not.toMatch(/stack|node_modules|tmp/i);
  });

  it("rejects extension spoofing", async () => {
    const res = await uploadBytes(await makePdf(1), "photo.png");
    expect(res.status).toBe(415);
  });

  it("rejects empty uploads", async () => {
    expect((await uploadBytes(new Uint8Array(), "a.pdf")).status).toBe(400);
  });

  it("rejects invalid ids (path traversal) and other owners' files", async () => {
    const bad = await download(new Request("http://test/api/files/..%2F..%2Fetc/download", { headers: headers() }), params({ id: "../../etc" }));
    expect(bad.status).toBe(404);
    const up = (await (await uploadBytes(await makePdf(1), "a.pdf")).json()) as UploadResponse;
    const other = await download(new Request(`http://test/api/files/${up.id}/download`, { headers: { "x-forwarded-for": "192.168.99.99" } }), params({ id: up.id }));
    expect(other.status).toBe(404);
  });

  it("refuses engine tools that aren't configured and unknown tools", async () => {
    const up = (await (await uploadBytes(await makePdf(1), "a.pdf")).json()) as UploadResponse;
    const send = (toolSlug: string) => processFiles(new Request("http://test/api/files/process", { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ toolSlug, fileIds: [up.id], options: {} }) }), undefined as never);
    expect((await send("protect-pdf")).status).toBe(501);
    expect((await send("does-not-exist")).status).toBe(400);
  });

  it("reports processing failures through the job without leaking internals", async () => {
    const up = (await (await uploadBytes(await makePdf(2), "a.pdf")).json()) as UploadResponse;
    const res = await processFiles(new Request("http://test/api/files/process", { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ toolSlug: "split-pdf", fileIds: [up.id], options: { mode: "ranges", ranges: "7-9" } }) }), undefined as never);
    const job = await waitForJob((await res.json()).jobId);
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/page ranges between 1 and 2/);
  });
});
