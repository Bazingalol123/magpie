# Mobile Capture: capability and security design

Status: design gate for Issue #56. This document is intentionally not an implementation of Android Share Target, iOS Shortcuts, or mobile tokens.

## Scope of this slice

This slice fixes the product and security contract before platform code is added:

- Mobile-only guidance popup with Android vs iOS/iPadOS copy.
- Capability states: `unsupported`, `needs_setup`, `ready`, `dismissed`, and `error`.
- Authenticated Dashboard remains the review surface.
- Mobile Capture stays separate from Chrome Extension pairing.
- No production traffic is enabled by this design document.

## Current repository findings

- The web app does not currently contain a web app manifest or Web Share Target handler.
- The existing service worker is the MV3 Extension service worker, not a first-party PWA service worker.
- Existing capture ingestion is `ingest-clip`; new mobile ingestion must audit and reuse its contract rather than create a parallel path casually.
- Existing Extension pairing and ingest URLs are not valid Mobile Capture credentials.

## Capability matrix

| Platform | Candidate first path | Required proof | Honest fallback |
| --- | --- | --- | --- |
| Android | Installed PWA + Web Share Target, URL first | Real Android device shares a URL into the installed PWA and receives an accepted/queued result | Dashboard review only; explain that setup is not ready |
| iOS/iPadOS | Shortcut with HTTPS request, URL/text first | Real iPhone/iPad runs the Shortcut, receives a local success notification, and the test user's capture appears | Dashboard review only; explain that the Shortcut is not installed or supported |
| Desktop | No mobile popup | Existing desktop Dashboard/Extension flow remains unchanged | None |

A user-agent string alone is not sufficient to claim that a platform capability is available. The UI must combine platform signals with capability/setup state and must never promise an unavailable Share Target or Shortcut.

## Popup contract

Show automatically only for authenticated phones/tablets when the user has not dismissed the local-device guidance. The popup must:

- Explain that Dashboard is for review/organization and Mobile Capture is a separate input path.
- Never advertise Chrome Extension installation or pairing as the mobile solution.
- Show platform-specific primary guidance and a secondary dismiss action.
- Support `Don't show again` stored locally on that device.
- Provide a reopen path from authenticated Docs/Help or Settings.
- Respect safe-area insets and touch targets of approximately 44px.
- Avoid collecting URLs, titles, text, filenames, tokens, or other payloads in analytics.

### Android copy intent

`Share a page or link → choose Magpie → review the saved item in Dashboard.`

Only show PWA installation steps when the browser reports a relevant install capability. The first MVP accepts a bounded URL payload; text/title/file metadata remain optional and bounded.

### iOS/iPadOS copy intent

`Share from Safari or a supported app → run the Magpie Shortcut → return to Dashboard after the local success notification.`

Do not claim that an Android-style Web Share Target works on iOS unless real-device verification proves it. The first iOS candidate is a Shortcut using HTTPS and no embedded service credentials.

## Backend and security contract

- Use an authenticated owner session or a scoped, revocable, write-only Mobile Capture token.
- Never reuse the MV3 Extension pairing token.
- Tokens are owner-scoped, rotatable, revocable, and never placed in URLs, screenshots, logs, analytics, or client-visible errors.
- Audit `ingest-clip` before adding a function. Define bounded URL/title/text/note/file metadata, accepted MIME types, byte limits, rate limits, and safe rejection responses.
- Enforce authorization and validation server-side; the client is not a trust boundary.
- Coordinate duplicate handling with #22 and token lifecycle with #27.
- Use isolated test owners/data under #58; never use production user data during device verification.

## Verification gates

Before platform implementation is considered complete:

- Android real-device URL share reaches the intended test user's Inbox/Collection.
- iOS real-device Shortcut/direct POST reaches the intended test user's Inbox/Collection and displays a local success notification.
- Unsupported browsers show a truthful fallback with no dead CTA.
- Invalid, expired, revoked, cross-owner, oversized, and wrong-type submissions are rejected safely.
- Duplicate submissions are idempotent or safely identified.
- Screenshots/results include device model, OS version, browser/Shortcut version, state, and timestamp.
- No production user data or secrets appear in evidence.

## Planned PR slices

1. **This design gate:** capability matrix, contract, security boundary, and verification plan.
2. **Popup/help UI:** mobile-only OS-aware guidance with `Don't show again` and reopen path; no capture backend yet.
3. **Backend/token slice:** scoped mobile token lifecycle and bounded ingest contract, coordinated with #22/#27.
4. **Android slice:** manifest, PWA, Web Share Target, and real-device verification.
5. **iOS slice:** Shortcut artifact, setup/revocation documentation, and real-device verification.

Each implementation PR must state its slice explicitly and must not silently combine unverified Android and iOS capabilities.
