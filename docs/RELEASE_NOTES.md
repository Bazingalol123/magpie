# Magpie — Beta Release Notes (Draft)

> This draft describes current merged work and its deployment status. It is
> not a hosted-UX verification announcement — deployment status and manual
> browser verification are tracked separately below. Updated 2026-08-16 for
> issue #47 (pre-beta source-of-truth audit); see `docs/BETA_LIMITATIONS.md`
> for the full claim-by-claim status table.

## For users

- A first-run onboarding checklist now guides signed-in users through pairing
  and the first capture (PR #34). Deployed to the site
  (2026-08-14T21:39:38Z); not yet manually browser-verified.
- Capture status is shown after the Extension sends an item, including when
  an item needs review.
- Deleting an Item, Collection, or Project now correctly removes every child
  row even past 200+ Enrichments or 100+ WatchRules (B13, PR #40). Deployed
  to production functions (2026-08-14T23:14:53Z, evidence: GitHub Actions run
  `31849671121`); not yet manually browser-verified end to end.
- The dashboard now loads every owned row past the previous 200-row cap per
  entity (G1, PR #16). Deployed to the site; not yet manually verified
  against a real account with 200+ rows.
- The public site gained a landing-journey clarification, SEO/trust
  foundations, and Google Search Console verification (PRs #41, #43, #45).
- The Extension supports a local Playwright/Chromium verification path for
  the six supported capture modes (issue #19 Phase 1, PR #35) — this is
  local-only verification against a local `base44 dev` backend, not a hosted
  smoke test.

## For contributors

- Run the local capture matrix with `npm run test:e2e`. It exercises the
  real Extension against local Vite and Base44 services — local
  verification, not hosted smoke testing.
- Run the full release-gate suite locally before pushing (see `CLAUDE.md`);
  `ci.yml` also runs it automatically on every push/PR.
- The extension is still popup-based (`extension/manifest.json` uses
  `action.default_popup`, no `side_panel` key). The Chrome Side Panel
  migration is tracked as issue #46 and had not merged as of 2026-08-16 —
  do not write or rely on Side Panel instructions until it lands.

## Current limits

- The full onboarding journey (signed-out landing explanation, a distinct
  "paired and ready" state, the wider recovery-state set, and fixture/
  Playwright tests) is not complete — see G9 in `docs/BUGS_AND_BEHAVIORS.md`.
- The full product demo replay (issue #33) is not done.
- Manual, owner-driven browser verification of the review panel, deletion
  flows (especially Collection/Project cascade delete), blocked-source
  pause/resume, and onboarding surfaces has not been performed since their
  latest changes — deployment (code is live) and live UX verification
  (someone clicked through it in production) are two different claims; see
  `docs/BETA_LIMITATIONS.md`.
- Concurrent-ingest idempotency (simultaneous duplicate requests, not just
  sequential retries) remains an open gate (G2).
- Folders (bounded two-level Collection navigation) are not built.
- This draft's evidence for "deployed" comes from `deploy-base44.yml`
  GitHub Actions run history, which is real deployment evidence but not a
  substitute for hosted UX verification.

## Links

- [Getting Started](GETTING_STARTED.md)
- [Product Guide](PRODUCT_GUIDE.md)
- [Known beta limitations](BETA_LIMITATIONS.md)
- [Onboarding implementation — PR #34](https://github.com/Bazingalol123/magpie/pull/34)
- [Local capture matrix — PR #35](https://github.com/Bazingalol123/magpie/pull/35)
- [Cascade-delete pagination fix (B13) — PR #40](https://github.com/Bazingalol123/magpie/pull/40)
- [Dashboard pagination completeness (G1) — PR #16](https://github.com/Bazingalol123/magpie/pull/16)
- [Signed-in onboarding — Issue #17](https://github.com/Bazingalol123/magpie/issues/17)
- [Local verification harness — Issue #18](https://github.com/Bazingalol123/magpie/issues/18)
- [Chrome capture matrix — Issue #19](https://github.com/Bazingalol123/magpie/issues/19)
- [Full demo replay — Issue #33](https://github.com/Bazingalol123/magpie/issues/33)
- [Chrome Side Panel migration — Issue #46](https://github.com/Bazingalol123/magpie/issues/46)
- [Source-of-truth audit — Issue #47](https://github.com/Bazingalol123/magpie/issues/47)
- [Don't-Make-Me-Think UX audit — Issue #48](https://github.com/Bazingalol123/magpie/issues/48)
- [Beta release checklist — Issue #49](https://github.com/Bazingalol123/magpie/issues/49)
