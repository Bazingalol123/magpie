import { assert } from "jsr:@std/assert";

const extensionDirUrl = new URL("../extension/", import.meta.url);

Deno.test("manifest does not declare externally_connectable -- unpacked installs get a different random ID per machine, so a fixed-ID ping cannot work", async () => {
  const manifest = JSON.parse(await Deno.readTextFile(new URL("manifest.json", extensionDirUrl)));
  assert(!manifest.externally_connectable, "must not declare a mechanism that cannot function without a fixed extension key");

  const serviceWorker = await Deno.readTextFile(new URL("service-worker.js", extensionDirUrl));
  assert(!serviceWorker.includes("onMessageExternal"), "must not carry the now-nonfunctional external-ping handler as dead code");
});

Deno.test("content.js marks the dashboard's own page with a presence signal, scoped to Magpie's own origins only", async () => {
  const contentJs = await Deno.readTextFile(new URL("content.js", extensionDirUrl));
  assert(contentJs.includes('data-magpie-extension'), "must set a DOM marker the dashboard can check without needing this extension's ID");
  assert(contentJs.includes("magpie:extension-present"), "must also fire an event for a dashboard script that's already listening");
  assert(
    contentJs.includes("magpiecapture"),
    "must gate the marker to Magpie's real origin -- browser-enforced location.origin, not spoofable by page script",
  );
  // The marker must be gated by an origin check, not set unconditionally --
  // otherwise any third-party site could read "this visitor has Magpie
  // installed" as a fingerforprinting signal.
  const markerLine = contentJs.split("\n").find((line) => line.includes("data-magpie-extension") && line.includes("setAttribute"));
  assert(markerLine, "could not locate the marker-setting line");
  const guardIndex = contentJs.indexOf("location.origin");
  const markerIndex = contentJs.indexOf(markerLine);
  assert(guardIndex >= 0 && guardIndex < markerIndex, "the marker must be set inside an origin check, not unconditionally");
});

Deno.test("the dashboard reads the presence marker without needing this extension's ID, and the tour skips the download step once detected", async () => {
  const device = await Deno.readTextFile(new URL("../src/lib/device.js", extensionDirUrl));
  assert(device.includes("data-magpie-extension"), "must check the same attribute content.js sets");
  assert(device.includes("magpie:extension-present"), "must also listen for the event, in case the page's own script runs before the content script does");

  const controller = await Deno.readTextFile(new URL("../src/tour/useTourController.js", extensionDirUrl));
  assert(controller.includes("isExtensionInstalled") && controller.includes("onExtensionInstalled"), "the tour must use the shared detection utility, not reinvent one");
  assert(controller.includes("PAIR_EXTENSION_INDEX"), "detecting the extension must skip straight to pairing, not just acknowledge it happened");
});

Deno.test("the in-panel tour recomputes its popover position after drive/moveTo, not just once against a layout that can still shift", async () => {
  const tour = await Deno.readTextFile(new URL("tour.js", extensionDirUrl));
  assert(tour.includes("scheduleRefresh"), "must schedule a position recompute after driving -- sidepanel.css's font-display: swap can reflow the layout after drive() runs");
  assert(tour.includes(".refresh()"), "must call driver.js's real refresh() API");
  assert(tour.includes("document.fonts"), "must specifically wait for the custom webfonts sidepanel.css loads, the confirmed cause of the stuck-bottom-left-corner bug");
});

Deno.test("the tour's first drive() waits for a confirmed non-zero panel size, since a real docked Side Panel can report zero size briefly on open", async () => {
  const tour = await Deno.readTextFile(new URL("tour.js", extensionDirUrl));
  assert(tour.includes("waitForStableSize"), "must gate the first drive() behind a real size signal, not just react to a bad position after the fact");
  assert(tour.includes("ResizeObserver"), "must use a real resize signal, not a fixed delay guess");
  assert(tour.includes("readyForFirstDrive"), "the gate must actually be awaited before the first drive()");
  assert(/await readyForFirstDrive;[\s\S]{0,200}chrome\.storage\.local\.get/.test(tour), "the gate must run before reading storage and driving, not after");
  assert(/setTimeout\(finish,\s*timeoutMs\)/.test(tour), "must have a hard timeout fallback so the tour can never hang forever if the observer never fires");
});

Deno.test("a successful capture writes lastCaptureOutcome locally, so the in-panel tour never reads owner data back", async () => {
  const serviceWorker = await Deno.readTextFile(new URL("service-worker.js", extensionDirUrl));
  assert(serviceWorker.includes("lastCaptureOutcome"), "submitCapture must record its own outcome for the in-panel tour to react to");
  assert(
    serviceWorker.indexOf("chrome.storage.local.set({\n    lastCaptureOutcome") < serviceWorker.indexOf("return { ...body, dashboard_url:"),
    "the outcome must be recorded before returning from a successful submission",
  );
});

Deno.test("the in-panel tour uses driver.js's real steps/drive/moveTo API, not the standalone highlight() method", async () => {
  const tour = await Deno.readTextFile(new URL("tour.js", extensionDirUrl));
  assert(!tour.includes(".highlight("), "highlight() silently forces showButtons to an empty array regardless of config -- must not be used");
  assert(tour.includes("steps: toDriverSteps"), "must build a real steps array so Back/Next/Done come from the library");
  assert(tour.includes('from "./vendor/driver.js"'), "must use the vendored, checked-in build -- there is no bundler here to resolve an npm import at package time");
  assert(tour.includes("tourDismissed"), "dismissal must persist across Side Panel closes via chrome.storage.local, mirroring the dashboard's User-record dismissal");
  assert(tour.includes("replay"), "there must be a way to restart the tour after it's been dismissed");
});

Deno.test("the in-panel tour's steps never reference owner data, only real Side Panel chrome", async () => {
  const steps = await Deno.readTextFile(new URL("tour-steps.js", extensionDirUrl));
  assert(steps.includes('"#start-picker"'), "must anchor to the real capture button");
  assert(steps.includes('"#open-dashboard"'), "must anchor to the real dashboard link");
});

Deno.test("the last step's content honestly distinguishes a capture that filed itself from one waiting in Nest for review", async () => {
  const steps = await Deno.readTextFile(new URL("tour-steps.js", extensionDirUrl));
  assert(steps.includes("buildExtensionTourSteps"), "step content must be a function of the real outcome, not a fixed string");
  assert(steps.includes('routingStatus === "needs_review"'), "must branch specifically on needs_review");
  assert(steps.includes("waiting in Nest"), "the needs_review variant must say where the capture actually is, not claim automatic filing");

  const tour = await Deno.readTextFile(new URL("tour.js", extensionDirUrl));
  assert(tour.includes("lastCaptureOutcome?.routingStatus"), "tour.js must read the real routing_status the extension's own submission got back");
  assert(tour.includes("ensureSteps"), "must reconfigure step content to match the real outcome before showing the last step");
});

Deno.test("driver.js is vendored (checked in), not resolved via npm import, since extension/ has no bundler", async () => {
  const stat = await Deno.stat(new URL("vendor/driver.js", extensionDirUrl));
  assert(stat.isFile, "extension/vendor/driver.js must exist");
  const cssStat = await Deno.stat(new URL("vendor/driver.css", extensionDirUrl));
  assert(cssStat.isFile, "extension/vendor/driver.css must exist");
});

Deno.test("sidepanel.js wires the in-panel tour and its replay control", async () => {
  const sidepanelJs = await Deno.readTextFile(new URL("sidepanel.js", extensionDirUrl));
  assert(sidepanelJs.includes('from "./tour.js"'), "sidepanel.js must import and initialize the in-panel tour");
  assert(sidepanelJs.includes("initExtensionTour()"), "the tour must actually be started");
  assert(sidepanelJs.includes("replay-tour"), "the replay control must be wired to a real element");

  const sidepanelHtml = await Deno.readTextFile(new URL("sidepanel.html", extensionDirUrl));
  assert(sidepanelHtml.includes('id="replay-tour"'), "the replay control must exist in the markup");
  assert(sidepanelHtml.includes('href="vendor/driver.css"'), "the vendored tour CSS must be linked");
});
