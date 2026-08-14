# Magpie — Next Release (Draft)

> This draft describes the current merged work. It is not a deployment announcement.

## For users

- A first-run onboarding checklist now guides signed-in users through pairing and the first capture.
- Capture status is shown after the Extension sends an item, including when an item needs review.
- The Extension supports a local Playwright/Chromium verification path for the six supported capture modes.

## For contributors

- Run the local capture matrix with `npm run test:e2e`.
- The matrix exercises the real Extension against local Vite and Base44 services. It is local verification, not hosted smoke testing.

## Current limits

- The full onboarding journey and full product demo replay are still being completed.
- Hosted/Production smoke verification is not part of this release draft.

## Links

- [Getting Started](GETTING_STARTED.md)
- [Product Guide](PRODUCT_GUIDE.md)
- [Onboarding implementation — PR #34](https://github.com/Bazingalol123/magpie/pull/34)
- [Local capture matrix — PR #35](https://github.com/Bazingalol123/magpie/pull/35)
- [Signed-in onboarding — Issue #17](https://github.com/Bazingalol123/magpie/issues/17)
- [Local verification harness — Issue #18](https://github.com/Bazingalol123/magpie/issues/18)
- [Chrome capture matrix — Issue #19](https://github.com/Bazingalol123/magpie/issues/19)
- [Full demo replay — Issue #33](https://github.com/Bazingalol123/magpie/issues/33)
