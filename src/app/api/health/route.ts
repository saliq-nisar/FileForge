import type { HealthResponse } from "@/lib/api/contracts";

export async function GET(): Promise<Response> {
  const body: HealthResponse = { status: "ok", time: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
