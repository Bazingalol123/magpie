# Redesign exploratory UX audit — 2026-08-24

Status: authenticated exploratory pass complete. The approved Item deletion
was executed and verified. Collection deletion is unreachable in the redesign
UI; Project deletion was cancelled because its live scope exceeded the named
confirmation. This pass compares the rendered local app and supplied
390px screenshots with the corrected 3b section of
`design_handoff_magpie_redesign/Magpie Redesign.dc.html`. It used the actual
local Base44 backend with a disposable owner account. No product code was
changed and nothing was deployed.

## Confirmed findings

| ID | Severity | Surface | Finding | Evidence | Recommendation |
|---|---:|---|---|---|---|
| UX-01 | P1 | Mobile Projects | A phone user cannot select a Project. The only Project switcher lives in `.library-heading`, and the whole heading is hidden at 680px and below. | `src/index.css:1064`; supplied Collection screenshot | Keep a compact Project selector above the Collection selector. Project and Collection are separate scopes and must not be collapsed into one ambiguous dropdown. |
| UX-02 | P1 | Project creation | Creating a Project closes the dialog but does not enter the created Project. The backend already returns `mission.id`; the frontend discards the response, reloads, and keeps the previous `activeMissionId`. | `src/App.jsx:2086-2091`; `base44/functions/create-mission/entry.ts:80` | After success, select the returned Project, clear/select its first Collection as appropriate, and navigate to Library. Show a useful empty Project state with Add capture. No backend change is required. |
| UX-03 | P1 | Mobile Project creation | Mobile Search exposes “New Project”, but UX-02 leaves the user outside it and UX-01 gives them no way to enter it afterward. | Search command action plus UX-01/02 | Treat UX-01 and UX-02 as one release-blocking journey, not independent polish issues. |
| UX-04 | P2 | Mobile Collection filter | `Changed` is hard-coded as the initial filter. This agrees with the design's “changed-first browsing” when changes exist, but produces a large empty panel for `Changed 0 / All 1`. | `src/App.jsx:841`; supplied Collection screenshot; corrected design shows `Changed 2` | Default to Changed only when `changedCount > 0`; otherwise start on All. If a user explicitly chooses Changed, remember that choice for the current Collection. |
| UX-05 | P2 | Empty Nest | Every zero-pending Nest renders “your first capture” and the full connect-source card, including accounts that already have filed captures. The screenshot simultaneously says “your first capture” and “2 more captures arrived”. | `src/App.jsx:719-748`; supplied Nest screenshot | Split the state: true first run gets source setup; an established account gets a compact “All caught up” state plus Add capture. |
| UX-06 | P2 | Empty Nest layout | At phone width, three 170px capture previews are forced into a horizontal strip inside the large setup card. The result is cropped media, a visible scrollbar, and a card that dominates the screen. | `src/index.css:952`; supplied Nest screenshot | Use one preview with paging, or remove the tutorial media from the returning-user empty state. Keep the primary actions above the fold. |
| UX-07 | P2 | Nest gestures | The swipe hint is enabled at the tablet breakpoint and then hidden again at the phone breakpoint, although phone is where the touch gesture matters most. | `src/index.css:933` and `src/index.css:1096` | Keep one concise gesture hint on the active triage card and retain visible Keep/Re-route buttons for discoverability and accessibility. |
| UX-08 | P2 | Capture setup | The empty Nest always offers “Pair extension”; it does not receive pairing state, so an already-paired user can be prompted to pair again. | `CaptureSourceOffer` has no `extensionInstalls` or paired-state prop | Change the primary action to Add capture when paired; move Reconnect/Pair into account or source management. |
| UX-09 | Expectation gap | OS behavior | The dashboard does not choose different layouts for iOS and Android. Responsive behavior is width-based; touch swipes are shared. The current onboarding checks only generic service-worker support. The earlier onboarding had separate iPhone/Android explanations, but explicitly said the phone could not be detected automatically. | `src/onboarding/OnboardingWelcomeFlow.jsx:7`; current/HEAD comparison | Keep the workspace UI consistent across mobile OSes. Detect capability, not user-agent. The native share sheet/Shortcut setup may differ by platform, but Nest/Collections/Signals should not. |
| UX-10 | Intentional | Phone comparison | The compare tray is hidden below 680px. The corrected reference places the dense matrix on iPad, not phone. | `src/index.css` mobile comparison rules; corrected 1d screen | Keep comparison on tablet/desktop unless a separate stacked phone comparison is designed. Do not squeeze the matrix into 390px. |
| UX-11 | P1 | Mobile capture routing | Creating a Project on mobile leaves the old hidden Project active. The next capture is silently filed into that previous Project. In the tested journey, `QA Recipe Research` was created, but the immediately captured lemon recipe appeared under `QA Camera Research`. | Actual local backend data; `src/App.jsx:2035-2043` sends the unchanged `activeMissionId`; UX-01/02 hide/prevent correcting that state | On Project creation, atomically select the returned Project before allowing capture. Show the active Project in the phone capture dialog and require an explicit Project choice when context is ambiguous. No backend change is required. |
| UX-12 | P1 | Saved-search Collection | Global Search can show a matching Item, but “Save live Collection” silently scopes the Collection to the currently active Project. The created Collection can therefore open with zero results. Searching `lemon` found the recipe; saving it while `QA Recipe Research` was active produced `Search · lemon — 0`. | Actual local backend data; Search receives all records at `src/App.jsx:2448`, while save adds `activeMissionId` at `src/App.jsx:2306-2313` and evaluation uses `missionRecords` at `src/App.jsx:2328-2330` | Make Search scope explicit. Either search only the active Project, save globally by default, or present a visible “Workspace / current Project” scope control and preserve it when saving. |
| UX-13 | P2 | First-run routing | A newly verified account created from `/login` landed at the bare-root Library instead of Nest. The redirect effect checks `window.location.pathname`, but pathname is not a dependency; the relevant state can already be stable when auth changes the URL. | Reproduced with a fresh disposable account; `src/App.jsx:2351-2363` | Route from the successful auth transition or use router location state as an effect dependency. Add a fresh-account integration test starting at `/login`. |
| UX-14 | P2 | Empty Project | The global “Your first capture filed itself” guide is shown inside a newly selected empty Project, even though that Project has no Items. | Reproduced in `QA Recipe Research`; guide condition at `src/App.jsx:2440` is account-level only | Scope contextual guides to the active Project/Collection or change the copy to remain true at workspace level. |
| UX-15 | P1 | Empty Project on mobile | At phone width, an empty Project loses its Project title, criteria, item count, and Add capture action because the entire Library heading is hidden. The user sees only a generic empty Collection state and cannot tell which Project is active. | Reproduced at 390×844; `src/index.css:1064` | Keep a compact mobile context header containing Project selector/name and Add capture. |
| UX-16 | P2 | Populated Nest on mobile | The one-card triage model is implemented, but a realistic long title/reason pushes Keep/Re-route/Dismiss below the 844px viewport; the fixed bottom navigation obscures the lower action area. | Reproduced with `camera-and-hotel` ambiguous capture at 390×844 | Reserve bottom-nav space, cap/collapse the explanation, and keep the decision actions sticky inside the card. Test with long dynamic content, not only design-fixture copy. |
| UX-17 | P2 | Search/Project context | Search looks global and returns records across Projects, while create-Project and save-search actions mutate the hidden active Project context. On mobile there is no visible indication of that context. | Reproduced across both QA Projects; `src/App.jsx:2448` passes global datasets | Put an explicit scope chip/dropdown in Search and expose the active Project consistently on mobile. |
| UX-18 | P1 | Collection removal | A Collection cannot be deleted from the redesign UI. The current `AppNavigation` renders Collection selection only. A delete control exists in the old `CollectionSidebar`, but that component is never rendered; `deleteCollection` is likewise never passed to a rendered component. | No delete action in the authenticated desktop or phone DOM; `CollectionSidebar` is defined at `src/App.jsx:542` but has no call site | Add an overflow/action menu to the active Collection header and mobile Collection context. Reuse the existing `delete-collection` function and show the full cascade scope before confirmation. No backend change is required. |
| UX-19 | P1 | Project removal safety | Project confirmation reports only the number of Collections, even though the backend permanently cascades Items, captures, Watches, update history, and routing decisions. `QA Recipe Research` displayed only “Delete 2 Collections?” despite containing an Item. | Reproduced in Project switcher; copy at `src/App.jsx:491`; cascade in `base44/shared/mission-removal.ts` | Show Project name plus exact Collection, Item, and Watch counts, state that deletion is permanent, and identify the fallback destination. Consider typed-name confirmation when the Project is populated. |

## Direct answers

- **Should Project creation enter the new Project?** Yes. The current behavior is
  a missing post-create transition, not an intentional backend limitation.
- **Can a Project be selected on mobile today?** No. The control is hidden.
- **Why is Changed the default?** The corrected design explicitly calls mobile
  browsing “changed-first”. The defect is applying that rule when there are no
  changed Items instead of falling back to All.
- **Will a physical phone receive a different dashboard by OS?** No. A physical
  phone adds real touch behavior, safe-area/browser chrome, and its native share
  sheet, but the React workspace is the same width-responsive UI on iOS and
  Android.
- **Can a Watch be created without chat?** Yes. The authenticated pass created
  one from Item detail and another from Search, then paused/resumed the first in
  Signals. These use the real backend and persisted. Discoverability is the
  remaining UI issue, not backend capability.

## Executed test cases

| Title | Preconditions | Steps to reproduce | Expected result | Actual result |
|---|---|---|---|---|
| Fresh account enters first task | Signed out; unused email; begin at `/login` | Create account, submit the verification code, wait for the workspace | Bare-root first run opens Nest and presents capture setup | **Fail:** opened global Library with zero Items (UX-13) |
| Create and enter desktop Project | Signed in at desktop width | Library → New Project → create `QA Camera Research` | Dialog closes and the created Project becomes active | **Fail:** stayed in `Your collections`; Project existed but required manual selection (UX-02) |
| Select desktop Project | Two Projects exist | Open Project switcher and choose each Project | Header, criteria, Collections, and Item counts update to the chosen Project | **Pass** on desktop |
| Select mobile Project | Two Projects exist; viewport 390×844 | Open Collections and account menu; try to change Project | A visible mobile Project control changes scope | **Fail:** no Project control exists (UX-01) |
| Create mobile Project | At mobile Search with an existing Project active | New Project → create `QA Recipe Research` | Created Project becomes visible and active | **Fail:** Search remained open and the old Project stayed active (UX-03) |
| Capture after mobile Project creation | Immediately after the previous case | Add from phone → submit lemon recipe URL and capture note | Capture is filed into the newly created Project | **Fail:** filed into `QA Camera Research`, the stale hidden Project (UX-11) |
| Mobile Collection initial filter | Collection contains one unchanged Item | Open Collection at 390×844 | All is selected when Changed count is zero | **Fail:** `Changed 0` selected and rendered a large empty panel; `All 1` required a tap (UX-04) |
| Route a real Nest card | Submit an ambiguous capture that requires review | Open Nest → inspect card → accept suggested Collection | One-card triage is usable; acceptance persists and Nest count decrements | **Partial:** persistence/count passed; long content pushed actions under the fold/nav (UX-16) |
| Returning-user empty Nest | Account has filed Items and zero pending captures | Open Nest at 390×844 | Compact “All caught up” state with Add capture | **Fail:** first-capture setup card, cropped tutorial strip, and contradictory “2 more captures” copy (UX-05/06) |
| Create Watch from Item detail | Item exists | Open `Sony A6700` → Watch → price → hourly → save | Watch persists and appears on Item/Signals | **Pass** using the real backend |
| Pause and resume Watch | Active hourly Watch exists | Signals → Pause → reload/check → Resume | State persists on each transition | **Pass** using the real backend |
| Create Watch from Search | Searchable recipe Item exists | Search `lemon` → Watch recipe name → weekly → save | Watch persists without requiring Ask/chat | **Pass** using the real backend |
| Save a live Search Collection | Matching Item exists in a different Project from the hidden active Project | Search `lemon` globally → Save live Collection → open it | Saved Collection contains the result shown before saving, or clearly states the chosen scope | **Fail:** `Search · lemon` opened with zero Items (UX-12/17) |
| Empty Project mobile context | Select an empty Project on desktop, then resize to 390×844 | Open Collections | Project name/scope and Add capture remain available | **Fail:** all Project identity/actions disappear (UX-15) |
| Delete Item with dependencies | `Sony A6700` has an active hourly Watch | Item detail → advanced actions → Remove this item → Delete permanently | Confirmation names the cascade; Item, Capture, Watch, and history are removed; counts refresh | **Pass:** workspace changed 3→2 Items, Camera Listings 1→0, Item dialog closed, and only the recipe Watch remained in Signals |
| Delete Collection from redesign UI | `Mixed Content Captures` contains one accepted QA Item | Select the Collection and inspect desktop/mobile Collection actions | A reachable delete action shows full cascade confirmation and removes the Collection after approval | **Blocked/Fail:** no Collection delete control exists in the rendered redesign (UX-18); fixture was not bypass-deleted |
| Delete populated Project safely | `QA Recipe Research` owns `Mixed Content Captures` and `Search · lemon` | Project switcher → Delete QA Recipe Research | Confirmation discloses all Collections, Items, Watches/captures/history and the fallback Project | **Fail/cancelled:** copy said only “Delete 2 Collections?”; deletion was cancelled because it also included `Search · lemon`, outside the named confirmation (UX-19) |

## Verified working behavior

- Real captures were classified into backend Collections and appeared in the
  workspace without fixture-only rendering.
- A real ambiguous capture entered Nest and acceptance persisted.
- Item-detail and Search both create Watches without Ask/chat.
- Signals pause/resume persisted against the backend.
- Desktop Project switching worked once the Project was manually selected.
- No new runtime warning/error was emitted during the authenticated journeys.
  The console contained only the expected pre-auth 401/404 attempts from the
  account-verification transition.

## Destructive-check outcome

The user approved deletion of the three specifically named local fixtures.
The outcome was:

- Item `Sony A6700`: deleted. Its hourly Watch disappeared and live counts
  refreshed correctly. The backend uses the shared `cascadeRecord` path for
  the Capture, RoutingDecision, Enrichment, WatchRule, and Record cleanup.
- Collection `Mixed Content Captures`: not deleted because the redesign exposes
  no Collection-delete UI (UX-18). The backend function exists.
- Project `QA Recipe Research`: not deleted. At the confirmation boundary it
  proved to contain two Collections (`Mixed Content Captures` and
  `Search · lemon`) and one Item. The only copy shown was “Delete 2
  Collections?”. Deletion was cancelled because that scope exceeded the
  named empty-Project confirmation and revealed UX-19.

No unapproved entity was deleted.

## Remediation update — 2026-08-24

All actionable findings in this audit have now been addressed in the local
frontend. UX-01/03/15 add mobile Project context and switching; UX-02/11 enter
the backend-returned Project and expose capture destination; UX-04 falls back
to All when Changed is empty; UX-05/06/07/08 split returning Nest state,
constrain mobile media/content, preserve gestures/actions, and use real pairing
state; UX-12/17 add explicit Search scope and preserve it when saving; UX-13
reruns first-entry routing on authenticated-user transition; UX-14 scopes the
guide to the active Collection; UX-16 reserves the triage action area; UX-18
adds Collection removal; and UX-19 discloses the full counted cascade. UX-09
and UX-10 remain intentional product decisions rather than defects.

Verification after remediation: all 244 Deno tests and the Vite production
build pass. After the owner restored the disposable authenticated session, the
desktop and true 390×844 browser pass created and entered a Project, selected
it on mobile, confirmed its Add-capture and Search scope controls, and removed
it after the complete cascade warning. The historical Actual results above are
preserved as the evidence that motivated the fixes; they should not be read as
current source behavior. No deployment ran.
