import { apiHandler } from "@/server/api";
import { handleUpload } from "@/server/services/file-service";

/** Streams the raw request body to temporary storage with a hard size limit. */
export const POST = apiHandler("upload", async (req, identity) => {
  return Response.json(await handleUpload(req, identity), { status: 201 });
});
