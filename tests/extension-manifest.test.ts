import { assert, assertEquals } from "jsr:@std/assert";

const manifestUrl = new URL("../extension/manifest.json", import.meta.url);
const extensionDirUrl = new URL("../extension/", import.meta.url);

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(new URL(relativePath, extensionDirUrl));
    return stat.isFile;
  } catch {
    return false;
  }
}

Deno.test("extension manifest is valid JSON with a well-formed Side Panel configuration", async () => {
  const raw = await Deno.readTextFile(manifestUrl);
  const manifest = JSON.parse(raw);

  assertEquals(manifest.manifest_version, 3);
  assert(typeof manifest.version === "string" && /^\d+\.\d+\.\d+$/.test(manifest.version), "version must be a semver string");

  // Issue #46: the extension opens as a Chrome Side Panel, not an
  // action-click popup.
  assert(!manifest.action?.default_popup, "manifest.action must not declare default_popup (Side Panel migration)");
  assert(
    typeof manifest.side_panel?.default_path === "string" && manifest.side_panel.default_path.length > 0,
    "manifest.side_panel.default_path must be set",
  );
  assert(
    Array.isArray(manifest.permissions) && manifest.permissions.includes("sidePanel"),
    "manifest.permissions must include \"sidePanel\"",
  );
});

Deno.test("extension manifest references only files that exist under extension/", async () => {
  const manifest = JSON.parse(await Deno.readTextFile(manifestUrl));

  assert(await fileExists(manifest.background.service_worker), `missing background.service_worker: ${manifest.background.service_worker}`);
  assert(await fileExists(manifest.side_panel.default_path), `missing side_panel.default_path: ${manifest.side_panel.default_path}`);

  for (const iconPath of Object.values(manifest.icons ?? {}) as string[]) {
    assert(await fileExists(iconPath), `missing top-level icon: ${iconPath}`);
  }
  for (const iconPath of Object.values(manifest.action?.default_icon ?? {}) as string[]) {
    assert(await fileExists(iconPath), `missing action.default_icon entry: ${iconPath}`);
  }
  for (const scriptEntry of manifest.content_scripts ?? []) {
    for (const jsPath of scriptEntry.js ?? []) {
      assert(await fileExists(jsPath), `missing content_scripts js: ${jsPath}`);
    }
    for (const cssPath of scriptEntry.css ?? []) {
      assert(await fileExists(cssPath), `missing content_scripts css: ${cssPath}`);
    }
  }
});

Deno.test("the retired popup surface has no leftover files or manifest references", async () => {
  const raw = await Deno.readTextFile(manifestUrl);
  assert(!raw.includes("popup.html"), "manifest must not reference popup.html after the Side Panel migration");

  assertEquals(await fileExists("popup.html"), false, "extension/popup.html should have been removed");
  assertEquals(await fileExists("popup.js"), false, "extension/popup.js should have been removed");
  assertEquals(await fileExists("popup.css"), false, "extension/popup.css should have been removed");
});

Deno.test("capture errors preserve the backend request ID for user-visible support references", async () => {
  const serviceWorker = await Deno.readTextFile(new URL("service-worker.js", extensionDirUrl));
  assert(serviceWorker.includes("body.request_id"), "service worker must read request_id from error responses");
  assert(serviceWorker.includes("Reference ID:"), "service worker must expose a safe reference ID in capture errors");
});

Deno.test("the Side Panel script never imports @base44/sdk (extension trust boundary)", async () => {
  const sidepanelJs = await Deno.readTextFile(new URL("sidepanel.js", extensionDirUrl));
  assert(!sidepanelJs.includes("@base44/sdk"), "extension/sidepanel.js must not import @base44/sdk");
});

Deno.test("Escape cancels element and snip modes from both the page and the focused Side Panel", async () => {
  const contentJs = await Deno.readTextFile(new URL("content.js", extensionDirUrl));
  const sidepanelJs = await Deno.readTextFile(new URL("sidepanel.js", extensionDirUrl));
  const keydownStart = contentJs.indexOf('document.addEventListener("keydown"');
  // Search by declaration instead of a literal LF-only blank line so this
  // contract is stable in Windows checkouts with CRLF source files.
  const keydownEnd = contentJs.indexOf("function cancelCaptureMode", keydownStart);
  const keydownBlock = contentJs.slice(keydownStart, keydownEnd);

  assert(
    contentJs.includes('event.key === "Escape" && (pickerActive || snipActive)'),
    "the content script must cancel either interactive capture mode on Escape",
  );
  assert(
    keydownBlock.trimEnd().endsWith("}, true);"),
    "the page Escape listener must run in the capture phase before host-page handlers can swallow it",
  );
  assert(
    contentJs.includes('message?.type === "magpie:cancel-picker"'),
    "the page must accept an explicit cancellation from another extension surface",
  );
  assert(
    sidepanelJs.includes('chrome.tabs.sendMessage(tabId, { type: "magpie:cancel-picker" })'),
    "Escape in the focused Side Panel must be forwarded to the tab where capture started",
  );
  assert(
    sidepanelJs.includes('activeCaptureTabId = tab.id'),
    "the Side Panel must remember the capture tab instead of cancelling whichever tab is active later",
  );
});
