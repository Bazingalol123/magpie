const ingestUrl = document.getElementById("ingest-url");
const extensionToken = document.getElementById("extension-token");
const status = document.getElementById("status");
const openDashboard = document.getElementById("open-dashboard");
const missionSelect = document.getElementById("mission-select");
const captureIntent = document.getElementById("capture-intent");
const connectionPill = document.getElementById("connection-pill");
const setupCallout = document.getElementById("setup-callout");
const connectionSettings = document.getElementById("connection-settings");
const autoRefresh = document.getElementById("auto-refresh");

chrome.storage.local.get({ autoRefreshEnabled: true }).then((config) => {
  autoRefresh.checked = config.autoRefreshEnabled;
});
autoRefresh.addEventListener("change", () => chrome.storage.local.set({ autoRefreshEnabled: autoRefresh.checked }));

function updateConnectionState() {
  const connected = Boolean(ingestUrl.value.trim() && extensionToken.value.trim());
  document.body.dataset.connected = String(connected);
  connectionPill.textContent = connected ? "paired" : "not connected";
  setupCallout.hidden = connected;
  if (!connected) connectionSettings.open = true;
}

chrome.storage.local.get({ ingestUrl: "", extensionToken: "", activeMissionId: "", captureIntent: "compare" }).then((config) => {
  ingestUrl.value = config.ingestUrl;
  extensionToken.value = config.extensionToken;
  captureIntent.value = config.captureIntent;
  updateConnectionState();
  if (config.ingestUrl && config.extensionToken) loadMissionContext(config.activeMissionId);
});

document.getElementById("save-settings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    ingestUrl: ingestUrl.value.trim(),
    extensionToken: extensionToken.value.trim(),
    activeMissionId: missionSelect.value,
    captureIntent: captureIntent.value,
  });
  updateConnectionState();
  status.textContent = "Saved locally.";
  await loadMissionContext(missionSelect.value);
});

missionSelect.addEventListener("change", () => chrome.storage.local.set({ activeMissionId: missionSelect.value }));
captureIntent.addEventListener("change", () => chrome.storage.local.set({ captureIntent: captureIntent.value }));
document.getElementById("refresh-context").addEventListener("click", () => loadMissionContext(missionSelect.value));

document.getElementById("start-picker").addEventListener("click", async () => {
  await startPicker("element");
});

document.getElementById("start-visual").addEventListener("click", async () => {
  await startPicker("visual");
});

document.getElementById("save-page").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "magpie:capture-tab", tabId: tab.id, mode: "page" });
    if (!response?.ok) throw new Error(response?.error || "Capture failed.");
    status.textContent = "Captured — organizing in Magpie.";
    window.setTimeout(() => window.close(), 450);
  } catch (error) {
    status.textContent = error.message || "Magpie cannot run on this page.";
  }
});

async function startPicker(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await startPickerInTab(tab.id, mode);
    window.close();
  } catch (error) {
    status.textContent = error.message || "Magpie cannot run on this page.";
  }
}

openDashboard.addEventListener("click", async () => {
  const { ingestUrl: configuredIngestUrl } = await chrome.storage.local.get({ ingestUrl: "" });
  const dashboardUrl = getDashboardUrl(configuredIngestUrl);
  if (!dashboardUrl) {
    status.textContent = "Save the hosted ingest URL first.";
    return;
  }

  await chrome.tabs.create({ url: dashboardUrl });
  window.close();
});

function getDashboardUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname.includes("/functions/") ? url.origin : "";
  } catch {
    return "";
  }
}

async function loadMissionContext(selectedMissionId = "") {
  const url = contextUrl(ingestUrl.value.trim());
  const token = extensionToken.value.trim();
  if (!url || !token) {
    status.textContent = "Save the connection to load Projects.";
    return;
  }

  status.textContent = "Loading Projects…";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...appHeaders(url),
      },
      body: "{}",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not load Projects");

    const projects = body.projects ?? body.missions ?? [];
    missionSelect.replaceChildren(new Option("Auto-organize", ""));
    projects.forEach((project) => missionSelect.add(new Option(project.title, project.id)));
    missionSelect.value = projects.some((project) => project.id === selectedMissionId) ? selectedMissionId : "";
    await chrome.storage.local.set({ activeMissionId: missionSelect.value });
    status.textContent = projects.length
      ? `${projects.length} optional Project${projects.length === 1 ? "" : "s"} available.`
      : "Auto-organize is ready.";
  } catch (error) {
    status.textContent = error.message;
  }
}

function contextUrl(value) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/functions\/ingest-clip\/?$/, "/functions/extension-context");
    return url.toString();
  } catch {
    return "";
  }
}

function appHeaders(value) {
  try {
    const match = new URL(value).pathname.match(/\/api\/apps\/([^/]+)\/functions\//);
    return match
      ? {
          "X-App-Id": decodeURIComponent(match[1]),
          "Base44-App-Id": decodeURIComponent(match[1]),
        }
      : {};
  } catch {
    return {};
  }
}

async function startPickerInTab(tabId, mode) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "magpie:start-picker", mode });
    return;
  } catch (error) {
    if (!String(error?.message || error).includes("Receiving end does not exist")) throw error;
  }

  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await chrome.tabs.sendMessage(tabId, { type: "magpie:start-picker", mode });
}
