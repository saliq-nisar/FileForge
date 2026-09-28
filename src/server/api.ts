import "server-only";
import type { ApiErrorBody } from "@/lib/api/contracts";
import { AppError, toAppError, type ErrorCode } from "@/lib/errors";
import { logger } from "./logger";
import { identify, rateLimit, type Action, type RequestIdentity } from "./security";

const STATUS: Partial<Record<ErrorCode, number>> = {
  UNSUPPORTED_FORMAT: 415,
  FILE_TOO_LARGE: 413,
  TOO_MANY_FILES: 400,
  TOO_FEW_FILES: 400,
  EMPTY_FILE: 400,
  CORRUPTED_PDF: 422,
  ENCRYPTED_PDF: 422,
  INVALID_OPTIONS: 400,
  ENGINE_UNAVAILABLE: 501,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  CANCELLED: 409,
};

export function errorResponse(error: unknown): Response {
  const e = toAppError(error);
  const status = STATUS[e.code] ?? 500;
  if (status >= 500) logger.error("request failed", { code: e.code, cause: e.cause instanceof Error ? e.cause : undefined });
  const body: ApiErrorBody = { error: { code: e.code, message: e.userMessage } };
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Wraps a route handler with identity, rate limiting and safe error mapping.
 * Heavy logic stays in services; handlers only translate HTTP <-> service calls.
 */
export function apiHandler<C>(action: Action, handler: (req: Request, identity: RequestIdentity, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const identity = await identify(req);
      rateLimit(identity, action);
      const res = await handler(req, identity, ctx);
      res.headers.set("cache-control", "no-store");
      return res;
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function badRequest(message?: string): AppError {
  return new AppError("INVALID_OPTIONS", message);
}
