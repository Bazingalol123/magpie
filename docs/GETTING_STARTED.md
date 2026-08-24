# Getting started with Magpie

Magpie turns pieces of the web you find — listings, products, jobs, recipes —
into structured, comparable, self-updating collections. This guide takes you
from nothing to your first organized, watched Item in about five minutes.

**You need:** Google Chrome, a Google account, and the
[extension download](https://github.com/Bazingalol123/magpie/releases/latest).

## 1. Sign in to the dashboard

Open **<https://magpiecapture.com>** and click **Continue with Google**.
That's the whole signup — your workspace is created on first sign-in and
everything in it is visible only to you.

## 2. Install the Chrome extension

The extension is not on the Chrome Web Store; it loads as an *unpacked*
extension, which takes about a minute:

1. Download the [extension zip](https://github.com/Bazingalol123/magpie/releases/latest)
   from the latest GitHub release and unzip it (or get the full
   [repository](https://github.com/Bazingalol123/magpie) if you want the
   source too).
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the unzipped **`extension/`** folder.

The Magpie icon appears in your toolbar (pin it via the puzzle-piece menu).
Chrome shows a standard "developer mode extensions" notice on restart — that's
expected for any unpacked extension.

> **Why this is safe to install:** the extension is deliberately *write-only*.
> It holds one opaque pairing token that can submit captures to your account
> and nothing else — it cannot read your collections, your items, or anything
> in your workspace. The full model is in the [Product Guide](PRODUCT_GUIDE.md#trust-model).

## 3. Pair the extension with your account

1. Click the Magpie toolbar icon. Chrome opens the Magpie **side panel** —
   it docks alongside the page and stays open while you switch tabs, so you
   never lose it mid-setup.
2. In the side panel, click **Open dashboard in a new tab**. The dashboard
   opens next to the side panel; click **Pair extension** (top-right) there.
3. The dialog shows two values: an **ingest function URL** and a one-time
   **pairing token** (shown only once; the server keeps only its hash). Copy
   both.
4. Switch back to the tab with the still-open side panel, paste both values
   into the **Connection** section (already expanded), and click
   **Save connection**.

The side panel's status pill flips to **● paired** and the capture buttons
light up.

To manage more than one browser, use **Connected browsers** in the dashboard's
account rail. Each browser keeps its own write-only token; pairing another one
does not disconnect the first. You can revoke one browser or use **Revoke every
browser** as an emergency reset. A revoked Side Panel clears the unusable
credential, keeps the dashboard address, and tells you to reconnect. Existing
tokens need no migration: a browser becomes identifiable the next time its Side
Panel successfully loads Projects.

## 4. Capture something

Open any page with something worth keeping — a product, an apartment listing,
a recipe — and pick whichever feels natural:

| Action | How |
|---|---|
| **Clip element** | Side panel button or `Alt+Shift+M`, hover the part you want (it highlights), then press `C` — or just click it |
| **Snip area** | Side panel button, then drag a rectangle over anything, exactly like a screenshot snipping tool |
| **Save page** | Side panel button; captures the page's title, description, and visible text |
| **Right-click** | Any selected text, link, or image → *Save … to Magpie* |

You don't choose a destination — that's the point. A toast tells you what
happened: saved to an existing Collection, a new Collection was created, or it
needs a quick review (with a link straight to it).

## 5. Watch it become structured

Open the dashboard. Your capture is now an **Item** — a structured row (price,
title, whatever fits its type) inside a **Collection** that Magpie chose or
created. Click the row for the full picture: extracted fields, the original
screenshot and captured text, source link, and update history.

If Magpie wasn't confident, the capture sits in **Needs review** (amber button,
top bar) instead of polluting a collection. From there you decide in one click:
accept Magpie's suggestion, move it to a collection you pick, create a new
collection (optionally under a new Project), or dismiss it.

## 6. Keep it current

- In an Item's detail panel, **Check source now** re-reads the source page.
- Ask Magpie (or use the detail panel) to create a **watch** — hourly, daily,
  or weekly automatic checks. Real changes appear as evidence-backed history:
  `rent €1,420 → €1,340`.
- Some sites (rentals, flights, anything behind a login) block server checks.
  Magpie doesn't pretend: the Item shows a clear "source requires sign-in"
  state — and here's the trick: **just visit the page yourself**. The
  extension notices you're on a page you saved, quietly re-captures it in your
  logged-in browser, and the Item heals itself, watch and all. On by default;
  toggle it off in the side panel any time.

## 7. Ask Magpie

Click **Ask Magpie** in the dashboard for a conversation grounded in your
actual data: *"What needs my attention?"*, *"Compare the Sony with the
Nikon"*, *"Why did this land in Cameras?"*, *"Watch this daily."* It answers
only from what you've saved — never invented facts — and every action it takes
runs through the same owner-checked backend as the buttons.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Side panel says "not connected" | Re-open **Pair extension** in the dashboard and paste fresh values — tokens are shown only once |
| Capture buttons do nothing on a page | Chrome system pages (`chrome://…`, the Web Store) block all extensions; try a normal site |
| Pressing `C` doesn't clip | Reload the extension at `chrome://extensions` — and note clicking the highlighted element always works too |
| Old tabs ignore new extension features | Reload the extension once; it re-equips all open tabs automatically |
| An Item shows "blocked" | That source needs a login; visit the page in your browser and Magpie updates it from there |

Next: the [Product Guide](PRODUCT_GUIDE.md) for every feature in depth, or the
[API reference](API.md) if you're integrating.
