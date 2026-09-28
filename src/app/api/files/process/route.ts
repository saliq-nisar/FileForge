import type { ProcessRequest, ProcessResponse } from "@/lib/api/contracts";
import { apiHandler, badRequest } from "@/server/api";
import { createProcessingJob } from "@/server/services/processing-service";

export const POST = apiHandler("process", async (req, identity) => {
  let body: ProcessRequest;
  try {
    body = (await req.json()) as ProcessRequest;
  } catch {
    throw badRequest("Invalid request body.");
  }
  const response: ProcessResponse = { jobId: await createProcessingJob(body, identity) };
  return Response.json(response, { status: 202 });
});
