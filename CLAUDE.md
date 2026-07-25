# Magpie — Claude Code project instructions

Magpie is a Chrome MV3 extension plus a Base44 backend and dashboard. It turns
selected web evidence into structured, owner-scoped information users can
organize, compare, and keep current.

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

## Base44 workflow

This is an existing linked Base44 project. Use the locally installed CLI only:

```powershell
npx.cmd base44 whoami
npx.cmd base44 dev
```

Before using Base44 SDK or CLI behavior, read the matching skill/reference in
`.agents/skills/`. Do not guess SDK method names.

## Release gates

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

The ten-gap release (Build Guide 29.4) is deployed at
<https://magpieorelse.base44.app>: Item deletion, review dismissal,
Project-scoped creation, blocked-watch auto-pause, chat markdown, review UX,
and the static CSS-3D landing page. The suite is 102/102. Next, in order: a
manual browser pass of the new surfaces, the `getOrNull` 404 sweep across older
functions, then folders or competition finish per
`docs/CLAUDE_CODE_HANDOFF.md`.
