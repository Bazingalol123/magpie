const OPERATIONS = ["capture", "watch_check", "cloud_check", "ask"] as const;
const PROVIDERS = ["base44", "zyte", "none"] as const;

export type UsageOperation = typeof OPERATIONS[number];
export type UsageProvider = typeof PROVIDERS[number];

export type UsageEventInput = {
  owner_id: string;
  operation: UsageOperation;
  provider?: UsageProvider;
  units?: number;
  provider_request_id?: string;
  idempotency_key?: string;
  outcome: "success" | "error";
  occurred_at?: string;
};

// Instrumentation only (docs/USAGE_AND_MONETIZATION_PROPOSAL.md decision-order
// step 1): this records usage without ever blocking or slowing the calling
// operation. It must never throw -- a failed usage write is a metrics gap,
// not a reason to fail a capture, watch check, or ask turn.
export async function recordUsageEvent(base44: any, input: UsageEventInput): Promise<boolean> {
  try {
    if (!input.owner_id || typeof input.owner_id !== "string") return false;
    if (!OPERATIONS.includes(input.operation)) return false;
    const provider: UsageProvider = PROVIDERS.includes(input.provider as UsageProvider) ? input.provider! : "base44";
    const units = Number.isFinite(input.units) && (input.units as number) >= 0 ? Math.round(input.units as number) : 1;
    const outcome = input.outcome === "error" ? "error" : "success";
    const occurredAt = input.occurred_at ?? new Date().toISOString();

    if (input.idempotency_key) {
      const existing = await base44.asServiceRole.entities.UsageEvent.filter({
        owner_id: input.owner_id,
        idempotency_key: input.idempotency_key,
      }, null, 1);
      if (existing[0]) return true;
    }

    await base44.asServiceRole.entities.UsageEvent.create({
      owner_id: input.owner_id,
      operation: input.operation,
      provider,
      units,
      ...(input.provider_request_id ? { provider_request_id: input.provider_request_id.slice(0, 200) } : {}),
      ...(input.idempotency_key ? { idempotency_key: input.idempotency_key.slice(0, 200) } : {}),
      outcome,
      occurred_at: occurredAt,
    });
    return true;
  } catch {
    return false;
  }
}
