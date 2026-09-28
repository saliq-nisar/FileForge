import { apiHandler } from "@/server/api";
import { authorize } from "@/server/security";
import { assertValidId, getStorage } from "@/server/storage/temp-storage";

export const DELETE = apiHandler("delete", async (_req, identity, ctx: RouteContext<"/api/files/[id]">) => {
  const { id } = await ctx.params;
  assertValidId(id);
  const storage = getStorage();
  const meta = await storage.getMeta(id);
  if (meta) {
    await authorize(identity, "delete", meta.owner);
    await storage.delete(id);
  }
  return new Response(null, { status: 204 });
});
