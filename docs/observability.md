# Observability and safe error diagnostics

## Why this exists

Base44 `appLogs.logUserInApp()` records product-usage events for the Analytics page. It is useful for events such as page visits or feature usage, but it is not an HTTP/backend request log: it does not provide a reliable status code, latency, exception classification, or request correlation chain.

Backend diagnostics use structured JSON written by the function runtime and a short-lived `DiagnosticEvent` entity. The client receives the same opaque `request_id` in error responses and the `X-Request-Id` response header. Entity persistence is best-effort: a logging failure never changes the original response.

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
