# Observability and safe error diagnostics

## Why this exists

Base44 `appLogs.logUserInApp()` records product-usage events for the Analytics page. It is useful for events such as page visits or feature usage, but it is not an HTTP/backend request log: it does not provide a reliable status code, latency, exception classification, or request correlation chain.

Backend diagnostics use one Sentry transaction per capture. The transaction contains bounded stage spans and is the primary durable error/success trace. Structured JSON written by the function runtime is supplementary only; Base44's production log retrieval is not currently reliable enough to treat it as the primary incident source.

Sentry receives backend errors through the HTTP Envelope API using the `SENTRY_DSN` Base44 secret. Events contain only bounded operational fields: request ID, function, operation, stage, status, error code, duration, environment, and a redacted message. No Sentry browser SDK is loaded by the React app or Extension, and no user/session/replay data is sent.

Capture successes and errors each send one transaction to Sentry with the same opaque request ID. No capture path creates a diagnostic database row. A Sentry transport failure never changes the original product response.


## Sentry configuration

Create or use a Sentry project, copy its DSN without committing it, and store it in Base44 as the `SENTRY_DSN` secret. Do not install `@sentry/react` for this backend integration and do not place the DSN in the frontend or Extension. The backend transport tags events with `runtime=backend` so it can share a project with the React setup while remaining distinguishable.

The safe verification path is: set the secret, deploy Functions, trigger a controlled unauthenticated request, and confirm the event in Sentry by its request ID. Never use a real capture payload as the first test.

## Structured error event

```json
{
  "timestamp": "2026-08-18T18:38:30.118Z",
  "event": "function.request.error",
  "request_id": "req_[opaque-id]",
  "status": 429,
  "error_code": "RATE_LIMITED",
  "message": "Rate limit exceeded",
  "outcome": "error"
}
```

Stable error codes currently include:

- `INVALID_REQUEST`
- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `PAYLOAD_TOO_LARGE`
- `UNSUPPORTED_MEDIA_TYPE`
- `RATE_LIMITED`
- `UPSTREAM_ERROR`
- `INTERNAL_ERROR`

## Redaction rules

Never include these in structured logs or diagnostic responses:

- Authorization headers or pairing/mobile tokens.
- Full URLs when they may contain private query parameters.
- Raw capture text, screenshots, filenames, or user payloads.
- Email addresses or other direct identifiers.
- Service credentials or provider responses.

## Investigation workflow

1. Capture the `request_id` from the client error or `X-Request-Id` response header.
2. Query the published function logs for the matching time window and function.
3. Compare the function event status with browser Network events. A function `429` and a Dashboard entity-query `429` are different failure paths.
4. Do not treat an `app.entity.query` analytics row as proof of HTTP success; it describes the attempted operation but does not contain the complete response status/latency/error chain.
