# iPhone and iPad: Share with Magpie

Safari on iOS and iPadOS does not support the Web Share Target API that
Android's installed-PWA capture uses, so there is no automatic "Share to
Magpie" entry the first time you open the app. A one-time Shortcut fills
that gap: it adds Magpie to your Share Sheet and hands the shared link to
the same `/share` page the dashboard already uses.

This sets up the real path end to end:

```text
iOS Share Sheet -> Shortcut -> https://magpiecapture.com/share -> sign in (if needed) -> saved capture
```

Nothing here uses a separate mobile token or a background HTTPS request —
the Shortcut only opens a URL in Safari, so your normal signed-in Magpie
session (or the sign-in prompt, if you're signed out) does the rest exactly
like it would if you tapped the link yourself.

## What you'll build

A Shortcut named "Share with Magpie" that:

1. Accepts a shared **URL** or **Safari web page** from the Share Sheet.
2. URL-encodes it.
3. Opens `https://magpiecapture.com/share?url=<encoded link>` in Safari.

That's it — three actions. Magpie's dashboard takes over from there: it
signs you in if you're signed out (returning to the same `/share` link
afterward) and shows a short form to add a note before saving.

## Setup steps

1. Open the built-in **Shortcuts** app on your iPhone or iPad.
2. Tap **+** (top right) to create a new shortcut.
3. Tap the shortcut's name at the top and rename it **Share with Magpie**.
4. Tap the **ⓘ** (Shortcut Details) icon, then:
   - Turn on **Show in Share Sheet**.
   - Under **Share Sheet Types**, enable **URLs** and **Safari web pages**.
     Leave Text, Images, and Files off — Magpie's capture form needs a real
     link, so sharing plain text without a URL won't save anything useful.
   - Close Shortcut Details.
5. Add the action **URL Encode** (search for it in the action picker).
   Leave its input as the default **Shortcut Input** — Shortcuts fills this
   in automatically from whatever you shared.
6. Add the action **Text**. In the text field, type:

   ```text
   https://magpiecapture.com/share?url=
   ```

   then tap the blue **Encoded Text** variable (from the previous step) to
   insert it right after, so the full text reads like:

   ```text
   https://magpiecapture.com/share?url=[Encoded Text]
   ```

7. Add the action **Open URLs**. Set its input to the **Text** result from
   step 6, and make sure it's set to open in **Safari** (the default).
8. Tap **Done**.

## Using it

From Safari, or any app with a Share button, share a page and choose
**Share with Magpie** from the Share Sheet (scroll the app row if it's not
visible, then tap **Edit Actions** to pin it near the top).

Safari opens Magpie's `/share` page:

- If you're signed out, you'll be sent through the normal Magpie sign-in
  and land back on the same shared link afterward.
- Once signed in, add a short note about why it matters and tap **Save to
  Magpie**. This is the one real action that creates the capture — the
  Shortcut itself never claims success on its own, because it can't see
  the result of a page it just handed off to Safari.

The saved Item then appears in your Magpie dashboard exactly like a Chrome
extension or pasted-URL capture, including automatic Collection routing,
Needs Review, or a failure state if something goes wrong.

## Verifying it end to end

To confirm the whole path works on a real device:

1. Run the Shortcut from the Share Sheet on a real web page.
2. Confirm Safari opens `magpiecapture.com/share` with the shared link
   already filled in as the source.
3. Sign in if prompted, add a note, and tap **Save to Magpie**.
4. Open the Magpie dashboard (in the browser or by returning to the app)
   and confirm the new Item is there, with the Collection it was routed to
   or a Needs Review / failed state if that's what happened.

Magpie never shows a separate confirmation that your phone or Shortcut is
set up correctly — a real saved Item (or an honest Needs Review / failed
state) is the only evidence the app shows, on this platform or any other.

## Troubleshooting

- **Magpie doesn't appear in the Share Sheet.** Scroll the row of apps to
  the end, tap **More**, then turn on **Share with Magpie**. You can also
  reorder it near the top from the same screen.
- **Safari opens but nothing loads.** Check the constructed URL starts with
  `https://magpiecapture.com/share?url=` — re-check step 6 for a stray
  space or a missing `[Encoded Text]` variable.
- **You're stuck on a sign-in loop.** Sign in to `magpiecapture.com`
  directly in Safari once first, then retry the share.
