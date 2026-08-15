# Magpie — Claude Code project instructions

Magpie is a Chrome MV3 extension plus a Base44 backend and dashboard. It turns
selected web evidence into structured, owner-scoped information users can
organize, compare, and keep current.

## Check for concurrent work before starting

This repo is worked concurrently by multiple tools/agents — Claude Code
sessions across branches and `.claude/worktrees/*`, and other assistants
(e.g. a remote personal-assistant tool that opens its own PRs). Before
starting any new task, run:

```powershell
git fetch origin
git branch -vv
git worktree list
gh pr list --state open
```

Never assume the currently checked-out branch or local `main` is
up to date or the only work in flight. If the branch you're on is already
merged, or another branch/worktree/PR overlaps with the task at hand, say so
before proceeding rather than silently working around it.

## Required reading

Before planning or editing, read:

1. `docs/PRODUCT_CHARTER.md` — authoritative product contract.
2. `docs/CLAUDE_CODE_HANDOFF.md` — current deployed state and next task.
3. `docs/API_AND_FAILURE_MAP.md` — backend and failure contracts.
4. `docs/V3_1_PRODUCT_AND_RISK_PLAN.md` — mandatory change-risk gate.
5. Relevant sections of `docs/BUILD_GUIDE.md`,
   `docs/ENGINEERING_NOTES.md`, and `docs/DECISIONS.md`.

If any document conflicts with the Product Charter, stop and reconcile the
conflict in documentation before changing production behavior.

## Architecture boundary

Do not import `@base44/sdk` into any MV3 extension file.

```text
Extension service worker
  -> plain fetch with an opaque pairing token in chrome.storage.local
  -> Base44 backend function
  -> service-role SDK writes after owner validation

Dashboard
  -> normal authenticated browser SDK and realtime subscriptions
```

The extension is an untrusted, write-only capture client. It must not read owner
data, hold service credentials, or receive Collection/Record contents.

## AI authority

AI proposes; deterministic code decides.

- The capture routing code agent may inspect only bounded, preloaded
  owner-scoped Projects and Collections. It has no entity-write tool.
- Automatic Project assignment requires confidence `>= 0.90` and a lead
  `>= 0.15`. Explicit Project context always wins. No match stays global;
  ambiguity enters review.
- The configured `magpie_organizer` Agent has four backend-function tools, no
  direct entity tools, and memory disabled.
- The configured Agent cannot move Items or resolve routing until the
  owner-validated `resolve-routing` workflow exists.
- Do not add arbitrary server-side crawling of user-submitted URLs.

## Change discipline

For High or Critical changes, document the backend contract, failure behavior,
migration, rollback, fixtures, and deployment surface before production code.

After each completed step:

- update `docs/BUILD_GUIDE.md`;
- append real platform findings to `docs/ENGINEERING_NOTES.md`;
- record deliberate omissions in `docs/DECISIONS.md`;
- update `docs/CLAUDE_CODE_HANDOFF.md` if current state or next work changes.

Do not deploy, push entities, synchronize Agents, or deploy the site without
explicit owner approval. `npx base44 agents push` is a full synchronization.

## CI/CD

Three GitHub Actions workflows exist under `.github/workflows/`:

- `ci.yml` — runs the release gates below automatically on every push and PR.
  No manual action needed; nothing to trigger.
- `extension-release.yml` — packages and publishes a GitHub Release when a
  tag matching `extension-v*` is pushed (bump `extension/manifest.json`
  first; the workflow fails if the tag and manifest version disagree).
- `deploy-base44.yml` — the only path that touches Base44. `workflow_dispatch`
  only, with a `target` input (`all | entities | functions | agents | site`).
  Gated by the `production-deploy` GitHub Environment, which requires manual
  reviewer approval before the deploy step runs.

Claude Code must not run `gh workflow run deploy-base44.yml` (or trigger it
via the API) without the owner's explicit go-ahead in the current
conversation, even though the environment approval gate would still block
the actual `npx base44` call. This is the same rule as "no deploy without
explicit owner approval" below, applied to the automated path too.

## Base44 workflow

This is an existing linked Base44 project. Use the locally installed CLI only:

```powershell
npx.cmd base44 whoami
npx.cmd base44 dev
```

Before using Base44 SDK or CLI behavior, read the matching skill/reference in
`.agents/skills/`. Do not guess SDK method names.

## Release gates

`ci.yml` (see CI/CD above) now runs all of this automatically on every push
and PR. Still run it locally before pushing when practical, for a faster
signal than waiting on Actions.

PowerShell:

```powershell
$magpieDeno = "$env:USERPROFILE\.deno\bin\deno.exe"
& $magpieDeno test --allow-env --allow-read tests

$entryFiles = (Get-ChildItem -Path base44\functions -Filter entry.ts -Recurse).FullName
& $magpieDeno check $entryFiles

$extensionScripts = (Get-ChildItem -Path extension -Filter *.js -Recurse).FullName
foreach ($script in $extensionScripts) { node.exe --check $script }

rg -n "@base44/sdk" extension
npm.cmd run build
```

The SDK-import search must return no extension matches.

## Current continuation point

> Reconciled 2026-08-16 by the issue #47 documentation audit. This section
> was stale (test count and deploy status); see `docs/CLAUDE_CODE_HANDOFF.md`
> and `docs/BETA_LIMITATIONS.md` for the full current picture and evidence.

The ten-gap release (Build Guide 29.4) is deployed at
<https://magpieorelse.base44.app>: Item deletion, review dismissal,
Project-scoped creation, blocked-watch auto-pause, chat markdown, review UX,
and the static CSS-3D landing page. Work has continued well past that
checkpoint (cascade-delete pagination hardening, dashboard pagination
completeness, a Chrome capture Playwright matrix, first-run onboarding, and
public SEO/trust pages), and the automated suite is now 143/143, not 102/102
— see `docs/CLAUDE_CODE_HANDOFF.md`'s "Latest verified release gates" for the
current count and how it was reconfirmed.

The `getOrNull` 404 sweep across older functions is effectively resolved: the
only backend code using the unsafe raw `.get(id)` pattern (`if (!row) throw
404`, which the hosted SDK does not actually support — see
`docs/API_AND_FAILURE_MAP.md`'s "Hosted note" under `resolve-routing`) is
`base44/shared/enrichment.ts`'s `enrichRecord` and
`base44/shared/classification.ts`'s `classifyStoredClip`, and neither is
imported by any current `base44/functions/*/entry.ts` (verified by grep,
2026-08-16) — they are dead code, not a live 404-handling gap. Recommend a
follow-up cleanup issue to delete them rather than leaving live-looking dead
code with a known-wrong error-handling pattern in `base44/shared/`; this is a
cleanup, not a behavior fix, so it was not made here.

Next, in order: a manual browser pass of the current surfaces (review,
deletion, onboarding, blocked-source recovery — still outstanding per
`docs/CLAUDE_CODE_HANDOFF.md`), then folders (issue #25) or the beta backlog
(issues #46 Side Panel, #48 Don't-Make-Me-Think audit, #49 release checklist)
per `docs/CLAUDE_CODE_HANDOFF.md`.
