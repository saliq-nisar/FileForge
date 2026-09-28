import type { CapabilitiesResponse } from "@/lib/api/contracts";
import { serverConfig } from "@/server/config";
import { engineAvailability } from "@/server/engines";

export async function GET(): Promise<Response> {
  const body: CapabilitiesResponse = {
    engines: engineAvailability(),
    maxUploadBytes: serverConfig.maxUploadBytes,
    tempFileTtlMinutes: Math.round(serverConfig.tempFileTtlMs / 60_000),
    ai: Boolean(serverConfig.ai.provider),
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
