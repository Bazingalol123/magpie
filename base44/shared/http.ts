export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-app-id, base44-app-id",
  "Access-Control-Allow-Methods": "POST, PUT, OPTIONS",
};

export function json(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }

  console.error(error);
  return json({ error: "Unexpected server error" }, 500);
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
