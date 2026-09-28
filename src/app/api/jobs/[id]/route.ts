import { apiHandler } from "@/server/api";
import { getJobForOwner } from "@/server/services/processing-service";

export const GET = apiHandler("read-job", async (_req, identity, ctx: RouteContext<"/api/jobs/[id]">) => {
  const { id } = await ctx.params;
  return Response.json(await getJobForOwner(id, identity));
});
