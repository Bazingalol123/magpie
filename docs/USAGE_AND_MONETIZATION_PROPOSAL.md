# Usage and monetization proposal

Status: product proposal only. No billing, quota, entity, Function, secret, or
deployment change has been made.

## Recommendation

Do not sell a generic pool called “credits” in the first paid version. Magpie's
value is easy to explain as three product actions:

1. **Captures** — save and organize something.
2. **Watches** — keep an Item monitored.
3. **Cloud checks** — fetch a difficult source through Zyte when a normal
   source check is not enough.

Show those names and allowances to customers. Internally, record normalized
usage units so costs can change without rewriting plan copy or historical
events. Monetize freshness and automation first; do not make basic access to a
user's saved Library feel rented.

## What actually creates cost

| Operation | Main cost driver | Proposed customer treatment |
|---|---|---|
| Save and classify a Capture | Base44 function/database activity, AI classification, screenshot storage | Included monthly Capture allowance |
| Browse/search owned data | Database reads | Fair-use, not individually exposed |
| Ask/compare/explain | Agent/LLM work and Base44 integration usage | Included Ask allowance; rate limit abusive loops |
| Direct source refresh | Function execution, egress, persistence | Included Watch checks |
| Zyte source refresh | Per-site/per-request Zyte charge, sometimes browser rendering/extraction | Separate **cloud check** allowance |
| Screenshot/file retention | Storage and transfer over time | Storage/item ceiling, not per-view credits |
| Export/connectors | External integration calls | Paid-plan feature with fair-use limits |

Zyte prices by target-site tier and request type; successful HTTP and rendered
responses can have materially different costs, with separate charges for some
features. A single fixed public “one Zyte request = one credit” promise would
therefore be brittle. Base44 integration usage is also credit-based and can
vary by operation. Provider usage must be measured before plan margins are
treated as final.

Official references checked 2026-08-24:

- <https://docs.zyte.com/zyte-api/pricing.html>
- <https://www.zyte.com/pricing/>
- <https://docs.base44.com/Account-and-billing/Credits>
- <https://docs.base44.com/Account-and-billing/Billing-and-plans>

## Launch shape

| Plan | Purpose | Suggested beta allowance |
|---|---|---|
| Free | Prove the capture-and-organize habit | 50 new Captures/month, 3 active Watches, weekly/direct checks, 20 Ask turns, no automatic Zyte |
| Plus | Individual research and shopping | 500 new Captures/month, 25 active Watches, daily/direct checks, 200 Ask turns, a bounded cloud-check bundle |
| Pro — later | Heavy research and high-frequency monitoring | Higher Item/Watch limits, more frequent checks, larger cloud-check bundle, exports and priority processing |

Treat these numbers as beta hypotheses, not committed pricing. Start Plus near
the familiar single-user productivity range only after two weeks of measured
p50/p95 cost per Capture, Ask turn, direct check, and Zyte check. Prefer a hard
monthly cap and an explicit top-up over surprise overage billing. Warn at 70%,
90%, and 100%; never start a paid provider call after the hard limit.

## Required backend work before charging anyone

1. Add a service-write-only `UsageEvent` ledger with `owner_id`, `operation`,
   `provider`, normalized `units`, optional provider cost/request ID,
   `idempotency_key`, outcome, and timestamp. Do not store raw URLs, prompts, or
   page content in billing rows.
2. Add an owner-readable monthly aggregate and an owner-authenticated usage
   endpoint. The browser must never be trusted to increment or authorize its
   own quota.
3. Enforce allowance before AI/Zyte work and finalize the event afterward.
   Retries must reuse the idempotency key and must not double-charge.
4. Add plan/subscription state with a grace path for billing outages. Blocking
   automation must not hide or delete existing Library data.
5. Add provider-level spend limits and alerts. Keep the current
   `ZYTE_POC_ENABLED` owner canary and scheduled-Zyte block until these guards
   exist.
6. Reconcile internal usage events against Base44 and Zyte dashboards before
   enabling purchases. Differences must alert; customer-visible balances
   cannot be inferred only from client events.

This is a real server change: it adds owner-scoped entities, service-role
writes, quota checks on expensive Functions, and eventually a payment-provider
webhook. It should be designed and reviewed as a separate backend/security
slice rather than added to the UI-only redesign work.

## Decision order

1. Instrument without blocking anyone.
2. Run the existing team/disposable accounts for two weeks and measure cost and
   failure distributions.
3. Enable one owner-only Zyte canary with a provider spending limit.
4. Freeze Free/Plus allowances from observed p95 cost plus a healthy margin.
5. Add checkout only after quota, idempotency, reconciliation, and downgrade
   behavior have automated tests.

The near-term product bet is: **free Library, paid vigilance**. Users pay when
Magpie keeps watching and tells them something changed, not merely because they
want to look at information they already saved.
