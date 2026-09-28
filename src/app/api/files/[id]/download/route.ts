import { AppError } from "@/lib/errors";
import { contentDisposition } from "@/lib/file/names";
import { apiHandler } from "@/server/api";
import { authorize } from "@/server/security";
import { assertValidId, getStorage } from "@/server/storage/temp-storage";

/** Streams a processed file as an attachment. Never rendered inline, never sniffed. */
export const GET = apiHandler("download", async (_req, identity, ctx: RouteContext<"/api/files/[id]/download">) => {
  const { id } = await ctx.params;
  assertValidId(id);
  const storage = getStorage();
  const meta = await storage.getMeta(id);
  if (!meta) throw new AppError("NOT_FOUND");
  await authorize(identity, "download", meta.owner);
  return new Response(storage.openStream(id), {
    headers: {
      "content-type": meta.mime,
      "content-length": String(meta.size),
      "content-disposition": contentDisposition(meta.name),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});
