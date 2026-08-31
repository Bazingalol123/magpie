import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("mobile Library exposes every Collection instead of only the active Project label", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  const recordTable = await Deno.readTextFile(new URL("src/features/library/RecordTable.jsx", root));
  assert(
    recordTable.includes('className="mobile-collection-select"'),
    "mobile Library needs a direct Collection selector",
  );
  assert(
    recordTable.includes("collections.map((item) => <option"),
    "the selector must render the real owner-visible Collection list",
  );
  assert(
    app.includes("selectCollectionAnywhere"),
    "selecting a Collection must also repair its Project scope before opening Library",
  );
  assert(
    recordTable.includes("Changed <span>{changedCount}</span>"),
    "Changed must disclose its real count",
  );
  assert(
    recordTable.includes("All <span>{pageRecords.length}</span>"),
    "All must disclose the number of visible Items",
  );
});

Deno.test("manual watch creation calls the existing guarded backend contract without chat", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  const watchDialog = await Deno.readTextFile(new URL("src/features/watches/WatchDialog.jsx", root));
  assert(
    watchDialog.includes("function WatchDialog"),
    "a first-class manual watch form must exist",
  );
  assert(
    app.includes('base44.functions.invoke("agent-configure-monitoring"'),
    "the form must use the owner-validating backend function",
  );
  assert(
    app.includes('action: "create"'),
    "the manual path must create or idempotently update a real watch",
  );
  assert(
    app.includes("frequency,"),
    "the selected schedule must reach the backend",
  );
  assert(
    app.includes("acquisition_strategy: acquisitionStrategy"),
    "the selected source strategy must reach the backend",
  );
  assert(
    app.includes("onCreateWatch={openWatchDialog}"),
    "Signals and Item actions must open the form rather than the agent panel",
  );
});

Deno.test("Search keeps result filters, actions, watch, and Ask after the user types", async () => {
  const searchSurface = await Deno.readTextFile(new URL("src/features/search/SearchSurface.jsx", root));
  assert(
    searchSurface.includes('className="search-scopes"'),
    "typed searches need Everything/Fields/Captured text/Sources filters",
  );
  assert(
    searchSurface.includes('className="search-query-actions"'),
    "actions must remain in populated query results",
  );
  assert(
    searchSurface.includes("onCreateWatch(watchCandidate.record"),
    "a matching Item must expose a direct watch action",
  );
  assert(
    searchSurface.includes("onAsk(query)"),
    "the current query must expose Ask Magpie",
  );
});

Deno.test("Collection comparison is built from real loaded Record fields", async () => {
  const recordTable = await Deno.readTextFile(new URL("src/features/library/RecordTable.jsx", root));
  const comparisonPanel = await Deno.readTextFile(new URL("src/features/library/ComparisonPanel.jsx", root));
  assert(
    comparisonPanel.includes("function ComparisonPanel"),
    "the compare view must exist",
  );
  assert(
    comparisonPanel.includes("records.map((record) => parseJson(record.fields_json, {}))"),
    "comparison must read actual Record fields_json",
  );
  assert(
    recordTable.includes('className="compare-tray"'),
    "selected Items need a visible compare tray",
  );
  assert(
    comparisonPanel.includes("Only differences"),
    "the iPad/desktop comparison needs a difference-focused mode",
  );
});

Deno.test("phone Nest is a one-card triage deck", async () => {
  const nestSurface = await Deno.readTextFile(new URL("src/features/nest/NestSurface.jsx", root));
  const css = await Deno.readTextFile(new URL("src/index.css", root));
  assert(
    nestSurface.includes('className="mobile-triage-progress"'),
    "the deck must show queue position and swipe guidance",
  );
  assert(
    css.includes(".nest-list .nest-card:not(:first-child) { display: none; }"),
    "phone layout must show one waiting capture at a time",
  );
});

Deno.test("mobile Library keeps Project context and capture actions visible", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  const css = await Deno.readTextFile(new URL("src/index.css", root));
  assert(app.includes('className="mobile-library-context"'), "phone Library needs an explicit Project context header");
  assert(app.includes('className="mobile-library-actions"'), "phone Project context needs Item count and Add capture actions");
  assert(css.includes(".mobile-library-context { margin-bottom:"), "the Project context must be rendered at the phone breakpoint");
});

Deno.test("Project creation selects the returned Project and clears stale Collection context", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("const missionId = response.data.mission.id"), "the frontend must use the backend's created Project id");
  assert(app.includes("setActiveMissionId(missionId)"), "the created Project must become active");
  assert(app.includes("setActiveCollectionId(firstCollection?.id ?? null)"), "a new empty Project must not inherit the previous Project's Collection");
  assert(app.includes('setActiveView("library")'), "creation must enter the new Project in Library");
});

Deno.test("saved Search exposes explicit Project scope", async () => {
  const searchSurface = await Deno.readTextFile(new URL("src/features/search/SearchSurface.jsx", root));
  assert(searchSurface.includes('className="search-workspace-scope"'), "Search must disclose workspace vs Project scope");
  assert(searchSurface.includes('workspaceScope === "workspace" ? "" : workspaceScope'), "saved searches must preserve the visible scope");
});

Deno.test("mobile Changed filter falls back to All when no changes exist", async () => {
  const recordTable = await Deno.readTextFile(new URL("src/features/library/RecordTable.jsx", root));
  assert(
    recordTable.includes('mobileFilterByCollection[collection.id] ?? (changedCount > 0 ? "changed" : "all")'),
    "Changed-first must not strand unchanged Collections in an empty initial state",
  );
});

Deno.test("Collection and Project deletion disclose the real permanent cascade", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  const collectionDeleteControl = await Deno.readTextFile(new URL("src/features/library/CollectionDeleteControl.jsx", root));
  const workspaceSwitcher = await Deno.readTextFile(new URL("src/features/library/WorkspaceSwitcher.jsx", root));
  assert(collectionDeleteControl.includes("function CollectionDeleteControl"), "the redesign must expose Collection removal");
  assert(app.includes("onDeleteCollection={deleteCollection}"), "Collection removal must call the existing guarded backend path");
  assert(collectionDeleteControl.includes("will be removed with their captures and history"), "destructive confirmations must disclose dependent-data removal");
  assert(workspaceSwitcher.includes("You'll return to Library"), "Project removal must name the fallback destination");
});

Deno.test("returning Nest and Item detail expose the next useful action", async () => {
  const pairingManagementDialog = await Deno.readTextFile(new URL("src/features/pairing/PairingManagementDialog.jsx", root));
  const recordDetail = await Deno.readTextFile(new URL("src/features/records/RecordDetail.jsx", root));
  const captureSourceOffer = await Deno.readTextFile(new URL("src/features/nest/CaptureSourceOffer.jsx", root));
  assert(captureSourceOffer.includes("Nothing needs your decision."), "returning users need an all-caught-up Nest instead of first-capture onboarding");
  assert(recordDetail.includes('className="detail-watch-summary"'), "manual Watch creation must be visible without expanding advanced actions or opening Ask");
  assert(pairingManagementDialog.includes("Pair another browser"), "paired users must not be told to repeat first-time pairing");
});
