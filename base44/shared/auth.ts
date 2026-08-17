import { HttpError } from "./http.ts";

type AuthenticatedUser = {
  id: string;
  email?: string;
  role?: string;
  data?: Record<string, unknown>;
};

export async function requireUser(base44: any): Promise<AuthenticatedUser> {
  try {
    const user = await base44.auth.me();
    if (!user) throw new HttpError(401, "Authentication is required");
    return user;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isAuthenticationError(error)) {
      throw new HttpError(401, "Authentication is required");
    }
    throw error;
  }
}

export async function requireExtensionPrincipal(base44: any, req: Request, touchLastUsed = true) {
  const token = extractBearerToken(req);
  if (!token) throw new HttpError(401, "A Magpie pairing token is required");

  const tokenHash = await sha256(token);
  const pairings = await base44.asServiceRole.entities.ExtensionInstall.filter({ token_hash: tokenHash }, null, 1);
  const pairing = pairings[0];
  if (!pairing || !pairing.active) {
    throw new HttpError(403, "This pairing token is inactive or invalid");
  }

  if (touchLastUsed) {
    await base44.asServiceRole.entities.ExtensionInstall.update(pairing.id, { last_used_at: new Date().toISOString() });
  }
  return { pairing, ownerId: pairing.owner_id };
}

export function canAccessOwner(user: AuthenticatedUser, ownerId: string) {
  return user.id === ownerId;
}

export function createPairingToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `mp_${encoded}`;
}

// req.url resolves to the internal Cloudflare dispatcher host in production
// (base44-dispatcher-production.base44.workers.dev), not a public app domain,
// so the ingest origin returned to new pairings must be hardcoded rather than
// derived from the request. Existing pairings already have a URL stored in
// chrome.storage.local and never call this again, so changing this constant
// only affects new pairings (issue #59).
const NEW_PAIRING_INGEST_ORIGIN = "https://magpiecapture.com";

export function buildIngestUrl() {
  return `${NEW_PAIRING_INGEST_ORIGIN}/functions/ingest-clip`;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractBearerToken(req: Request | undefined) {
  const authorization = req?.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(mp_[A-Za-z0-9_-]{30,})$/i);
  return match?.[1];
}

function isAuthenticationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: { message?: unknown; error?: unknown } };
  };
  const status = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
  const messages = [
    candidate.message,
    candidate.response?.data?.message,
    candidate.response?.data?.error,
  ].filter((value): value is string => typeof value === "string").join(" ");
  return status === 401 ||
    /authentication required|not authenticated|unauthorized|login required/i.test(messages);
}
