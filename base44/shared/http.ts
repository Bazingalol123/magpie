import { createClientFromRequest } from "npm:@base44/sdk";
import {
  classifyError,
  logStructuredEvent,
  persistDiagnosticEvent,
  requestIdFrom,
} from "./observability.ts";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-app-id, base44-app-id, x-request-id",
  "Access-Control-Expose-Headers": "x-request-id",
  "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
};

export function json(data: Record<string, unknown>, status = 200, requestId?: string) {
  const headers: Record<string, string> = { ...corsHeaders };
  if (requestId) headers["X-Request-Id"] = requestId;
  return Response.json(data, { status, headers });
}

export async function errorResponse(error: unknown, request?: Request) {
  const requestId = requestIdFrom(request);
  const classified = classifyError(error);
  const status = error instanceof HttpError ? error.status : classified.status ?? 500;
  const functionName = request?.url.split("/").filter(Boolean).pop() ?? "unknown";
  const diagnostic = {
    event: "function.request.error",
    request_id: requestId,
    function_name: functionName,
    status,
    error_code: classified.error_code,
    message: classified.message,
    outcome: "error",
    environment: "production",
  };
  logStructuredEvent(diagnostic);
  if (request) {
    try {
      await persistDiagnosticEvent(createClientFromRequest(request), diagnostic);
    } catch {
      // Diagnostics must never change the original error response.
    }
  }
  if (error instanceof HttpError) {
    return json({ error: error.message, request_id: requestId }, error.status, requestId);
  }

  return json({ error: "Unexpected server error", request_id: requestId }, 500, requestId);
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function requirePost(req: Request) {
  if (req.method === "OPTIONS") return true;
  if (req.method !== "POST") throw new HttpError(405, "Use POST");
  return false;
}

export function requirePostOrPut(req: Request) {
  if (req.method === "OPTIONS") return true;
  if (req.method !== "POST" && req.method !== "PUT") {
    throw new HttpError(405, "Use POST or PUT");
  }
  return false;
}
