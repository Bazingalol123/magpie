# Magpie — project brief

> Chrome extension + Base44 backend. Clip anything on the web; agents structure it and keep it alive.
> *(Name is a placeholder — change freely.)*

**Context:** entry for Base44's "Dev Build-Off" competition. Deadline **July 28, 2026**; target submission **Monday July 27 evening**. Judged on: backend depth, frontend creativity, usefulness, polish, documentation. Single winner.

---

## What it does

Clip any element on any page — a product, job listing, recipe, paragraph, apartment listing. A Base44 agent classifies it, picks the right schema, and structures it into entities. A companion dashboard shows rows appearing in realtime. Agents keep enriching afterward: price changes, listing closed, back in stock.

**The 60-second demo:**
1. Clip three wildly different things in ~15 seconds
2. They sort themselves into three different structured tables, live
3. Agent enrichment fires on one of them and the row updates itself on screen

---

## 🔴 Architecture constraint — read before writing any code

**Do NOT import `@base44/sdk` into the MV3 service worker.**

Verified against `@base44/sdk@0.8.40`:
- Token persistence in `utils/auth-utils.js` is guarded by `typeof window !== "undefined"`. Service workers have no `window`, so the guards short-circuit **silently** — no crash, but the token never persists.
- MV3 terminates idle service workers after ~30s, so the in-memory token is lost on every wake. Symptom: auth works once, then silently returns anonymous.
- At least one path in `modules/auth.js` touches `window.localStorage` without a `typeof` guard and may throw outright.

**Required shape:**

```
Extension service worker
  └── plain fetch() → Base44 backend function
        (token in chrome.storage.local)

Backend function
  └── @base44/sdk with asServiceRole — all entity writes happen here

Dashboard (normal web page)
  └── full SDK + socket.io realtime
```

Benefits: sidesteps MV3 entirely, keeps realtime on a normal page where sockets behave, and the extension holds no service credentials.

---

## Setup order

1. Install Base44 skills **first**: `npx skills add base44/skills`
2. `npx base44 create magpie`
3. Verify method names against the skill reference tables before writing SDK calls

⚠️ Base44 SDK method names are non-standard: `loginViaEmailPassword`, `loginWithProvider`, `asServiceRole`. **Do not assume Firebase or Supabase patterns** — the official skill docs warn about exactly this.

---

## Entities

| Entity | Fields |
|---|---|
| `Clip` | `source_url`, `raw_html`, `raw_text`, `screenshot_id`, `captured_at`, `collection_id`, `status` |
| `Collection` | `name`, `schema_json` (AI-inferred or user-defined), `owner_id` |
| `Record` | `collection_id`, `clip_id`, `fields_json` (conforms to collection schema) |
| `Enrichment` | `record_id`, `field`, `old_value`, `new_value`, `checked_at`, `agent_id` |
| `WatchRule` | `record_id`, `natural_language_condition`, `frequency`, `active` |

RLS: owner-scoped throughout, plus an asymmetric extension/dashboard split — see the trust boundary section below. Collections optionally shareable read-only.

---

## Backend functions

| Function | Purpose |
|---|---|
| `ingestClip` | Auth check, store raw payload + screenshot, enqueue classification |
| `classifyClip` | AI call → pick or create a Collection, infer schema, emit a Record |
| `enrichRecord` | Re-fetch source, diff against stored fields, write Enrichment |
| `sweepWatches` | Scheduled — runs active WatchRules via Superagent |

---

## Backend surface coverage (put this table in the README)

Every row must be load-bearing. If a surface is only there to tick a box, cut it and say why.

| Surface | Where used |
|---|---|
| Database & Entities | Schema above — core of the product |
| Backend Functions | `ingestClip`, `classifyClip`, `enrichRecord`, `sweepWatches` |
| AI & Agents | `classifyClip` calls the AI gateway for schema inference; `sweepWatches` runs enrichment as a scheduled Superagent |
| Realtime Sync | Rows appearing live in the dashboard as clips are classified — this is the demo |
| File Storage | Clip screenshots, CDN-served, shown beside structured fields |
| Auth & Identity | Dashboard login; scoped extension token in `chrome.storage.local` |
| Permissions & RLS | **Asymmetric trust boundary** — see below |
| Connectors | Export a Collection to Google Sheets / Notion via OAuth connector |
| Deployment | `npx base44 deploy`, custom domain |

### The RLS trust boundary (do not skip — this is the strongest depth claim)

The extension token and the dashboard user are **different principals with different permissions**:

| Principal | Can | Cannot |
|---|---|---|
| Extension token | Create `Clip` | Read `Record`, `Collection`, or `Enrichment` |
| Dashboard user | Full owner-scoped access | Cross-owner access |

Consequence: if someone extracts the token from the shipped extension, they can write clips and **learn nothing**. The client is untrusted by design; all reads happen server-side.

Write this up explicitly in the README. It is the difference between "I used RLS" and "I used RLS to enforce something."

---

## Screens

1. **Clip overlay** (content script) — element picker, hover highlight, one-key capture
2. **Dashboard** — collections as live tables, rows animating in
3. **Record detail** — structured fields beside original screenshot, enrichment history

Screens 1 and 2 are the demo. Build those well; keep 3 clean and simple.

---

## Build order

| When | Focus |
|---|---|
| **Thu night** | Spike only: extension `fetch` → backend function → entity write → visible in dashboard. Go/no-go. |
| **Fri** | Full backend. All entities, all functions, all nine surfaces. |
| **Sat** | Frontend. Clip overlay + dashboard. |
| **Sun** | Enrichment agent, seed data, bulletproof the demo path. |
| **Mon** | README, architecture doc, demo video. **Submit.** |
| **Tue** | Untouched buffer. |

---

## Scope guards

- **One** clip type end-to-end before adding others
- Schema inference: let AI propose, user confirms. Do not build a schema editor.
- Enrichment: one working example beats five flaky ones
- If Superagents can't be scheduled the way we need, fall back to a scheduled backend function — the story survives

---

## 📓 Documentation is a scoring axis — write it as you go

Documentation is one of five judged criteria. Do not leave it for Monday.

**Before writing code**, produce `docs/BUILD_GUIDE.md`: an ordered, checkpointed walkthrough of the build. Each step should state what gets built, which files change, and a concrete "you'll know this works when…" verification. Written so a competent developer who has never touched Base44 could follow it start to finish.

**During the build**, after each completed step:
- Tick the step in `docs/BUILD_GUIDE.md` and correct anything that turned out differently in practice
- Append anything surprising to `docs/ENGINEERING_NOTES.md` — platform quirks, SDK gotchas, dead ends and why they were abandoned

These notes are not overhead. They become the most credible part of the README, because they prove the build was real rather than generated.

**Rules:**
- Verification steps must be concrete and checkable, never "it should work now"
- If reality diverges from this brief, update the brief — do not silently work around it
- Keep `docs/DECISIONS.md` for anything intentionally *not* built, with the reason

---

## README must include

1. The problem — clipped content dies in bookmarks and screenshots
2. Architecture diagram
3. **Why this needs a real backend** — an extension has no backend by definition; `chrome.storage` doesn't sync structured data, run agents, or do realtime
4. The backend surface coverage table above
5. **The RLS trust boundary** — the asymmetric-principal design, stated plainly
6. The MV3 finding, written up as an engineering note — it demonstrates you read their SDK source
7. Anything deliberately *not* used, and why (from `docs/DECISIONS.md`) — stating this reads as judgment, not omission
8. Quickstart, linking to `docs/BUILD_GUIDE.md`