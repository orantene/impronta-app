# Builder Human QA Run - 2026-05-09

Run type: first execution pass from `web/docs/builder-human-qa-plan-2026.md`.

Environment:

- Local tenant: `http://localhost:3000/impronta`
- Edit URL tested: `http://localhost:3000/impronta?edit=1`
- Browser surface: Codex in-app browser
- Tester lens: non-technical agency owner, coordinator, designer/operator
- Time: 2026-05-09 17:49 EST

Main QA question:

> Can a non-technical user build, edit, preview, and publish a premium branded page without feeling confused, scared, or blocked?

Current answer: **No.** The builder has useful foundations, but this run found critical human-product blockers in performance, insert-to-canvas rendering, mobile preview, and trust clarity.

## Technical Checks Executed

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` | Pass | Completed successfully from `web/`. |
| `npm run test:tenant-isolation` | Pass | 26 tests passed. |
| Browser console errors | Pass for visible browser run | No browser errors reported during the final visible interaction sequence. |
| Playwright/e2e | Not run | Explicitly avoided. |
| Publish | Not run | Blocked intentionally because inserted section did not visibly render correctly on canvas. Publishing would not be trustworthy. |

## Scenario Results

| Scenario | Result | Severity | Summary |
|---|---|---|---|
| First-time user opens builder | Fail | High | Builder opens, but first impression is cluttered and not premium. Duplicate hero sections and repeated giant blurred blocks make the page feel broken or test-contaminated. |
| Add a new section | Fail | Critical | Directory Search Hero appears in navigator and inspector, but its actual canvas content does not visibly render as expected. |
| Edit existing text | Partial | Medium | Inspector text fields are available and clear enough, but canvas direct editing for the inserted section could not be trusted because the section content was not visibly rendered. |
| Reorder sections | Partial pass | Medium | Moving the inserted section down via navigator worked in this run. This means reorder is not universally broken, but it still needs broader testing across section and child levels. |
| Child-element expectations | Not complete | High risk | Navigator exposes child-like rows and move controls. Needs deeper validation because prior product concern remains: some rows may be prop-backed fields rather than true movable elements. |
| Change design/style | Not complete | High risk | Inspector exposes Content/Layout/Style/Responsive/Motion tabs, but render mismatch blocked meaningful style QA. |
| Responsive/mobile | Fail | Critical | Switching to Mobile mode produced a blank white phone canvas while navigator/inspector still showed selected content. |
| Publish trust | Not safe to run | Critical | Publish button became available while canvas output was wrong/blank. This is a trust blocker. |
| Revisions/recovery | Not run | Pending | Should run only after add/render/publish loop is reliable. |
| Header/footer shell | Not run | Pending | Site header appears in navigator; needs dedicated shell edit/publish test. |

## Critical Findings

### BUG-001 - Local builder performance can crash the dev server

Severity: Critical

Observed:

- During the first QA attempt, local admin/builder routes produced extremely long compile/load behavior.
- Dev server logs showed `/login?next=/impronta/admin` taking `8.7min`.
- The dev server then hit a Node heap out-of-memory fatal error.
- Logs included Supabase/auth fetch `ECONNRESET` retry errors before the crash.

Why this fails human QA:

- A real tester would see the builder as frozen or dead.
- This blocks the first-time user scenario before the builder can be judged.

Suggested fixes:

- Profile dev/build memory usage around admin-shell and edit chrome bundles.
- Split oversized prototype/admin modules that are included in local edit/admin routes.
- Confirm prototype-only code is not bundled into real tenant edit mode unnecessarily.
- Add a local smoke budget: first builder page interactive within a reasonable threshold.
- Consider increasing local dev heap as a temporary workaround, but treat the bundle/memory issue as the product fix.

### BUG-002 - Added section appears in navigator/inspector but does not visibly render correctly on canvas

Severity: Critical

Steps:

1. Open `http://localhost:3000/impronta?edit=1`.
2. Click add section.
3. Open `Directory Search Hero`.
4. Click `Add section`.
5. Wait for saving to complete.

Expected:

- New section appears in the navigator.
- New section appears visibly on the canvas.
- Canvas scrolls to and highlights the inserted section.
- Inspector selects the inserted section.
- The visible canvas content matches the inserted section title and copy.

Actual:

- Navigator changed from 9 to 10 sections.
- The inserted section appeared as `Find the right talent for your brief`.
- Inspector selected the inserted section and showed editable headline/subheadline fields.
- Canvas did not visibly show the inserted Directory Search Hero content.
- After scrolling, selection chrome appeared around the inserted section area, but the canvas still visually showed the previous giant hero design/blank area rather than the inserted search hero content.

Why this fails human QA:

- The user would ask, "Where did my section go?"
- The builder claims the section is saved/selected, but the visual result is not trustworthy.
- This is exactly the known high-risk failure: navigator/inspector sync without canvas rendering.

Suggested fixes:

- Trace insert pipeline from starter template to persisted section payload to canvas renderer.
- Verify the inserted starter maps to a renderable section kind, not only inspector props.
- Add a hard post-insert assertion: selected section must produce visible canvas DOM.
- Add auto-scroll and temporary highlight only after render completes.
- Add a regression test for "insert starter -> canvas contains starter headline."

### BUG-003 - Mobile preview shows a blank canvas for selected inserted section

Severity: Critical

Steps:

1. Insert `Directory Search Hero`.
2. Keep inserted section selected.
3. Click `Mobile` preview mode.

Expected:

- Mobile frame displays the selected section or its correct page context.
- User can inspect how the inserted section behaves on mobile.
- Controls remain usable.

Actual:

- Mobile frame became a tall blank white canvas.
- Navigator and inspector still showed the inserted selected section.
- No section content was visible in the mobile frame.

Why this fails human QA:

- Mobile-first testers cannot verify output.
- A user would not trust publish if mobile preview is blank.
- This blocks premium self-serve readiness.

Suggested fixes:

- Debug responsive preview render path for inserted/starter sections.
- Ensure mobile viewport uses the same section tree and renderer as desktop.
- Add mobile render assertions for every starter section.
- Add an empty-state error message if the section cannot render instead of a blank white frame.

## High Findings

### BUG-004 - First impression is not premium because test content is polluted and repetitive

Severity: High

Observed:

- Homepage opened with multiple duplicate hero sections.
- Canvas shows repeated giant blurred gradient hero blocks.
- Navigator has several near-identical labels such as `A house of curated talent`, `A house of curated talent. (2)`, and `A house of curated talent. (3)`.
- Some copy appears malformed, for example `Qssasafuiet, sss unhurried, always in the same key.`

Why this fails human QA:

- A non-technical agency owner would think the product or their page is broken.
- A designer would judge the builder as unfinished before testing controls.

Suggested fixes:

- Reset Impronta QA homepage to a curated clean baseline before human tests.
- Keep a separate destructive sandbox page for repeated insert/reorder tests.
- Add a "QA reset page" script/runbook so every test starts from the same state.
- Improve generated/default copy quality for starter insertions.

### BUG-005 - Save/publish trust is weak when visual output is wrong

Severity: High

Observed:

- After inserting the section, the topbar returned to `Saved`.
- Publish button was enabled.
- Canvas still did not show the inserted section content correctly.

Why this fails human QA:

- "Saved" implies safety, but the visual output contradicts it.
- A user could publish wrong or invisible content.

Suggested fixes:

- Do not show "Saved" as fully safe if canvas render validation fails.
- Add a render health/preflight warning before publish.
- Disable publish or show a blocking warning when selected/new section has no visible render output.

### BUG-006 - Brand/context clarity is mixed

Severity: High

Observed:

- Top-left edit chrome shows `Tulala`.
- Storefront canvas/header shows `Impronta`.
- The user is editing Impronta, but the product shell brand and tenant brand are not clearly separated.

Why this fails human QA:

- A tenant user may wonder whether they are editing Tulala or Impronta.
- This weakens confidence in tenant safety.

Suggested fixes:

- In the builder topbar, show product brand and tenant/page context distinctly.
- Example: `Tulala Builder · Impronta · Homepage`.
- Add clear page breadcrumb and tenant badge.

## Medium Findings

### BUG-007 - Add-section library is powerful but dense

Severity: Medium

Observed:

- Drawer includes search, categories, filters, saved templates, kits, starter sections, tags, and review cards.
- This is good product foundation, but visually heavy for first-time users.

Suggested fixes:

- Add a simplified default view for non-technical users.
- Keep advanced filters collapsed behind "More filters."
- Separate "starter kits" from "single sections" more clearly.
- Make the primary next action obvious: Add, Preview, or Review.

### BUG-008 - Some labels still feel technical

Severity: Medium

Observed:

- Review modal showed `Edit model: section props`.
- Tags such as data/control/source are useful for power users, but may feel internal.

Suggested fixes:

- Replace `section props` with human copy like `Preset section fields`.
- Hide implementation labels from default persona view.
- Keep advanced metadata available only in an advanced/details mode.

## Passing / Positive Signals

1. Edit mode opens on the real tenant path: `http://localhost:3000/impronta?edit=1`.
2. Topbar exposes page switcher, locale switcher, undo/redo, responsive preview, preview, comments, publish, and exit.
3. Add-section drawer has a strong foundation: search, categories, filters, saved templates, starter kits, and starter section cards.
4. Section review modal is useful and explains readiness, data connection, component recipe, and editable controls.
5. Inserted section selected in navigator and inspector after add.
6. Section reorder via navigator move button worked for the inserted section in this run.
7. `npm run typecheck` passed.
8. `npm run test:tenant-isolation` passed.

## Human QA Gate Decision

Internal QA Pass: **Fail**

Reasons:

- Critical add-section render mismatch.
- Critical mobile blank canvas.
- Critical local performance/server crash observed.
- Publish path cannot be trusted while canvas output is wrong.

Pilot User Pass: **Fail**

Reasons:

- A non-technical user would be confused by where the inserted section went.
- Mobile tester would be blocked.
- First impression is polluted by duplicate/test content.

Premium Self-Serve Pass: **Fail**

Reasons:

- Core add/edit/preview/publish loop is not trustworthy yet.
- Visual output does not match editor state.
- Mobile authoring/output is not ready.

## Recommended Next Fix Order

1. Fix starter section render parity: inserted `Directory Search Hero` must render visible canvas content immediately.
2. Add post-insert canvas validation and scroll/highlight behavior.
3. Fix mobile preview blank frame for selected/inserted sections.
4. Reset Impronta QA homepage to a clean controlled baseline before further human tests.
5. Add a render-health publish preflight that blocks publish when a section exists in state but has no visible canvas output.
6. Profile local dev memory and bundle size; stop admin/builder first-load OOM.
7. Re-run Scenario 2 and Scenario 7 before testing publish or pilot users.

## Re-Test Script

After fixes, rerun:

1. Open `http://localhost:3000/impronta?edit=1`.
2. Confirm clean baseline page.
3. Add `Directory Search Hero`.
4. Confirm it appears in navigator.
5. Confirm it appears visibly on canvas without manual refresh.
6. Confirm inspector selects it.
7. Switch Desktop, Tablet, Mobile.
8. Confirm all three show the section content.
9. Move the section up/down.
10. Confirm canvas and navigator order match.
11. Only then test publish.

## Fix / Retest Update - 2026-05-09

Scope retested:

- Local QA tenant: `http://localhost:3000/impronta?edit=1`
- Section under test: `Directory Search Hero`
- Browser method: Codex in-app browser, visual + DOM-facing checks

Code changes verified in this pass:

1. Coalesced the builder canvas refresh path after mutations so repeated save/insert/duplicate operations do not fight each other or call the router refresh path as if it returned a promise.
2. Added a selection-layer retry window for newly inserted/selected sections so the canvas can scroll/highlight after the refreshed server DOM actually mounts.
3. Confirmed the Directory Search Hero schema/renderer/editor support the search form and category chips used by the starter.
4. Removed a viewport-switcher group `title` attribute that triggered a hydration mismatch warning in the local browser log.
5. Hardened the inspector dock so it only renders loaded section data when that data belongs to the currently selected section. During slow selection changes, the dock now falls back to the selected row skeleton hint instead of showing the previous section title/tabs/content.
6. Restored missing publish split-menu ids with stable React ids so the publish options trigger and menu have valid ARIA wiring and typecheck passes.

Automated checks:

- `npm run typecheck`: pass.
- Scoped lint on `src/components/edit-chrome/edit-context.tsx` and `src/components/edit-chrome/selection-layer.tsx`: pass.
- `npm run test:builder-capabilities`: pass, 57 tests.
- After the viewport-switcher warning fix, `npm run typecheck` and scoped lint on `edit-context.tsx`, `selection-layer.tsx`, and `topbar.tsx` passed again.
- After the stale-inspector and publish-menu fixes, `npm run typecheck`, scoped lint on touched edit chrome files, and `npm run test:builder-capabilities` passed again.

Human/browser retest findings:

- `Directory Search Hero` is now visible on the canvas after selection.
- The canvas shows the expected headline, supporting copy, search input, Search button, and category chips.
- Navigator, canvas, and inspector can align on the inserted search hero in desktop mode.
- Mobile preview no longer produces the previously logged blank canvas. The search hero is visible in the mobile viewport.
- Mobile canvas overlay was adjusted so the floating nested-block manager does not cover narrow iframe/mobile canvases.

Updated issue status:

- BUG-002, add-section render mismatch: **improved / needs one clean add-from-empty retest**.
- BUG-003, mobile blank canvas: **improved / no blank frame observed in this pass**.
- Mobile overlay obstruction: **improved in code / needs one fresh browser retest after local performance stabilizes**.
- Stale inspector context on slow section selection: **improved in code / needs one fresh browser retest after local performance stabilizes**.
- BUG-005, publish trust: **still blocked from pass** until a clean add/edit/publish/reopen loop is completed.

Remaining friction observed:

- Impronta homepage is polluted with duplicate test sections, which makes selection and confidence harder than it should be.
- Mobile mode is visually usable now, but still needs another pass for touch ergonomics and inspector/navigator clarity.
- Need a clean baseline page before declaring the add-section flow truly fixed. Current page has several duplicate hero/search sections from earlier QA.
- Local browser QA remains slow under the current Impronta page load. During the last reload, local requests reached multi-second and occasional 40s+ response times, and the browser screenshot call timed out. This keeps BUG-001 open as a trust issue.
- A hydration warning appeared around the viewport switcher title attribute in the edit topbar. The static group title was removed; this needs one fresh browser reload check once local browser responsiveness stabilizes.
- The Codex in-app browser was able to read the public Impronta page and confirm the public search hero is visible, but navigation back into `?edit=1` timed out. This confirms BUG-001 remains a practical human-QA blocker: the local edit surface must be responsive before the full usability script is meaningful.

Next recommended execution order:

1. Reset or create a controlled Impronta QA homepage snapshot with one known baseline section set — see [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) (discard draft junction rows or curate in-builder).
2. Run the full Scenario 2 add-section test from a clean page: add `Directory Search Hero`, verify navigator, canvas, inspector, desktop/tablet/mobile, save, refresh.
3. Run a publish/reopen loop only after Scenario 2 is clean.
4. Keep logging every pass/fail in this document so the QA history stays in one place.
5. Investigate the viewport switcher hydration warning and the local performance spikes before asking a human tester to run the full script.
6. Re-attempt the inspector-sync retest only after local `?edit=1` can load reliably within a normal browser timeout.

## Fix / Retest Update - 2026-05-09, Pass 2

Scope:

- Local QA tenant remains `http://localhost:3000/impronta?edit=1`.
- Work stayed inside the existing edit surface and current builder foundation.
- No Playwright/browser-runner automation was used in this pass.

Code changes verified in this pass:

1. The navigator heading probe is now page-scoped. It sends only the visible page section ids into `loadHeadingProbeForLint()` instead of loading every tenant section for every navigator pass.
2. Added `listSectionsByIdsForStaff()` so the heading probe keeps tenant filtering while avoiding tenant-wide section scans.
3. Memoized the navigator section-id input list so heading lint can refresh on page version/section shape changes without React hook dependency warnings or unnecessary probe churn.
4. Added a navigator request key so the same heading probe is not re-fired repeatedly for the same page version and section-id set.
5. Inspector stale-section protection remains in place: if a slow section load belongs to the previously selected section, the inspector does not render that stale title/content against the newly selected row.
6. Publish split-menu ARIA ids remain stable after the topbar fix.

Automated checks:

- `npm run typecheck`: pass.
- Scoped lint on touched builder/server files: pass.
- `npm run test:builder-capabilities`: pass, 57 tests.
- `npm run test:tenant-isolation`: pass, 26 tests.
- After the duplicate-probe guard, `npm run typecheck`, scoped lint on the navigator/server files, and `npm run test:builder-capabilities` passed again.

Human/browser retest findings:

- The Codex in-app browser opened `http://localhost:3000/impronta?edit=1` successfully in this pass.
- The DOM confirmed the edit chrome is present: Navigator, Publish, Inspector, Page settings, and Revisions are all mounted.
- The public/canvas body is still polluted by duplicate QA sections, so this was not a clean human add/edit/reorder/publish script.
- Server logs improved after earlier 50-60s edit loads: the latest observed `GET /impronta?edit=1` completed around 4s, and the heading probe ran against page section ids. The probe is still roughly 1-1.6s and should remain on the performance watch list.

Updated issue status:

- Heading probe performance risk: **improved in code** by narrowing server reads to page section ids.
- React hook warning in navigator probe: **fixed**.
- Tenant safety for narrowed section reads: **verified** by `test:tenant-isolation`.
- Duplicate heading-probe calls for the same page version: **improved in code** with a client-side request key.
- BUG-001, local edit performance/reliability: **improved but open**. The editor loaded in this pass, but the run history still includes severe slow loads and the next gate needs repeat consistency.
- BUG-005, publish trust: **still blocked from pass** until a clean add/edit/publish/reopen loop is completed.

Next recommended execution order:

1. Create or restore a clean Impronta QA page state so the next human test is not polluted by duplicate sections.
2. Run Scenario 2 from the human QA plan on that clean page state.
3. Then run section reorder and publish/reopen before moving back to premium feature expansion.
4. Keep the heading probe on the performance watch list; if the edit surface becomes slow again, profile duplicate server requests and heavy navigator/inspector refresh paths before adding more UX features.

## Fix / Retest Update - 2026-05-09, Pass 3

Scope:

- Local QA tenant: `http://localhost:3000/impronta?edit=1`.
- Focus: section reorder trust, canvas render ordering, and one hydration warning caught by the in-app browser.
- Browser method: Codex in-app browser only.

Code changes verified in this pass:

1. Navigator section move buttons now resolve the previous/next target from the full flattened page order, not only the current slot. This makes the arrows behave like a page builder reorder control instead of silently trapping sections inside invisible template slots.
2. The move buttons still respect slot compatibility. For example, the hero slot remains protected from non-hero sections.
3. Drag/drop now uses the same flat-order target resolver, so button reorder and drag reorder share one interpretation of where the section should land.
4. Storefront canvas rendering now sorts non-hero CMS entries by homepage template slot order first, then `sortOrder`. This fixes unpredictable interleaving caused by multiple slots all starting their local order at `0`.
5. Removed the viewport-switcher group `title` attribute that produced a hydration mismatch in the local browser console.

Automated checks:

- `npm run typecheck`: pass.
- Scoped lint on `navigator-panel.tsx`, `agency-home-storefront.tsx`, and `topbar.tsx`: pass.
- `npm run test:builder-capabilities`: pass, 57 tests.

Human/browser retest findings:

- The in-app browser loaded the editor and confirmed Navigator + Publish were mounted.
- Clicking the `Move Hero — new down` control succeeded.
- Navigator order changed after the click:
  - Before: `A house of curated talent.` → `Hero — new` → `A house of curated talent. (2)`
  - After: `A house of curated talent.` → `A house of curated talent. (2)` → `Hero — new`
- This proves at least one real section reorder now works through the visible navigator button path.
- A fresh reload after the viewport-switcher title fix mounted Navigator + Publish again. The browser log API still showed the older hydration error timestamp from before the fix, but no new current hydration error was observed in that reload window.

Updated issue status:

- Section reorder via navigator buttons: **improved / partially verified**.
- Cross-slot reorder affordance: **improved in code** by using flat page order.
- Canvas render order across slots: **fixed in code** by using template slot order.
- Viewport-switcher hydration mismatch: **fixed in code / no new error observed after reload, but browser log history still contains the old entry**.
- Full publish/reopen trust: **still blocked from pass** until tested on a clean page state.

Next recommended execution order:

1. Create/restore a clean Impronta QA page state.
2. Run the complete human loop: add section, reorder, edit text, publish, reload visitor page.
3. Only after that, continue deeper premium builder work.

## Fix / Retest Update - 2026-05-09, Pass 4

Scope:

- Local QA tenant: `http://localhost:3000/impronta?edit=1`.
- Admin bridge under test: `http://localhost:3000/impronta/admin/website`.
- Browser method: Codex in-app browser only.

Code changes verified in this pass:

1. Fixed a runtime navigator crash after the reorder patch by moving the flat-order drop-target resolver into stable component scope. The editor no longer falls into `EditErrorBoundary` with `resolveSectionDropTarget is not defined`.
2. Confirmed section move buttons remain visible and keyboard/button reachable after the runtime fix.
3. Re-tested a real navigator reorder: `Move Hero — new down` changes the visible navigator order and does not throw a builder error.
4. Split Website admin URL handling into live-view origin and editor origin. On localhost, the Website page now opens visual editing through the tenant path base (`http://localhost:3000/impronta?edit=1&panel=sections`) instead of handing authenticated QA to the production/custom host.
5. Production/live view behavior is preserved: View live and posts still use the configured live origin.

Automated checks:

- `npm run typecheck`: pass.
- Scoped lint on `navigator-panel.tsx`, `agency-home-storefront.tsx`, and `topbar.tsx`: pass.
- `npm run test:builder-capabilities`: pass, 57 tests.
- After adding `panel=sections` to Website edit links, `npm run typecheck` and focused edit-chrome lint passed again.
- Linting the full prototype shell file still fails because of pre-existing baseline issues in unrelated Settings components. This pass did not attempt a broad `_pages.tsx` cleanup.

Human/browser retest findings:

- The in-app browser loaded `http://localhost:3000/impronta?edit=1&qaReload=navfix`.
- Navigator and Publish were mounted.
- No current `EditErrorBoundary` / `resolveSectionDropTarget` error appeared after the reload.
- A move button click completed without a recent builder error log.
- The browser log still contains an older viewport-switcher hydration record from before the title fix; no new builder crash was observed in this pass.

Updated issue status:

- Section reorder crash: **fixed and browser-retested**.
- Section reorder via navigator buttons: **working for the tested section path**.
- Website admin to builder handoff on localhost: **improved in code**. The target URL is now the tenant-scoped localhost editor with the sections panel open.
- Publish/reopen trust: **still blocked from pass** until tested on a clean page state.

Next recommended execution order:

1. Click through `http://localhost:3000/impronta/admin/website` -> Edit homepage and confirm the opened URL is `http://localhost:3000/impronta?edit=1`.
2. Create/restore a clean Impronta QA page state.
3. Run the complete human loop: add section, reorder, edit text, publish, reload visitor page.

## Fix / Retest Update - 2026-05-09, Pass 5

Scope:

- Focus: making the next clean Impronta QA reset safer.
- No tenant content was changed in this pass.

Code/documentation changes:

1. Added `--draft-only` support to `scripts/reset-impronta-homepage.ts`.
2. Added `npm run reset:impronta-homepage:draft`.
3. Updated [impronta-local-qa-homepage-baseline.md](./impronta-local-qa-homepage-baseline.md) to recommend the draft-only reset for normal human QA cleanup.
4. Documented that the existing empty-homepage reset remains intentionally destructive and should be kept for blank-canvas e2e only.

Safe dry-run result:

- Command: `npm run reset:impronta-homepage:draft`
- Tenant: `impronta` (`00000000-0000-0000-0000-000000000001`)
- Homepage locale: `en`
- Draft rows currently detected: `11`
- Live rows currently detected: `0`
- Apply effect if run with `-- --apply`: delete draft `cms_page_sections` only; leave `cms_pages` and published snapshots unchanged.

Automated checks:

- `npm run typecheck`: pass.
- `npm run reset:impronta-homepage:draft`: dry-run pass.

Updated issue status:

- Clean QA reset tooling: **improved / dry-run verified**.
- Clean page state: **not applied yet**. The user or next operator must intentionally run `npm run reset:impronta-homepage:draft -- --apply` before the clean human QA loop.

## Fix / Retest Update - 2026-05-12, Pass 6 (automation + dev ergonomics)

Scope:

- No new product UI in this pass.
- Confirm automated regression coverage for the historical **BUG-002 / BUG-003** insert + device-preview paths (`Directory Search Hero` starter).
- Reduce local setup confusion: path-tenant Impronta builder must use **`localhost`** as `Host`, not `app.local` through the host proxy.

Automated checks:

- From `web/`, `npm run test:e2e:impronta-directory-search-hero` → **Pass** (Chromium, ~35s) against `PLAYWRIGHT_BASE_URL=http://localhost:3000` with dev sign-in. Asserts desktop canvas content and content inside **`iframe[title="mobile preview"]`** after insert.
- Repo root `npm run typecheck && npm run lint` → **Pass** (same session).

Code / ops hygiene:

- [`scripts/dev.sh`](../../scripts/dev.sh) now echoes that URLs like `/impronta?edit=1` require **`http://localhost:3000/...`**, not `http://app.local:3102/...` (see [`web/src/proxy.ts`](../src/proxy.ts) path-tenant rules).

Updated issue status:

- **BUG-002 / BUG-003 (Directory Search Hero path):** **mitigated by CI-playable e2e** on local dev; still **not a substitute** for a clean-page human run or the **Phase 0 registered-host matrix** ([phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md)).
- **BUG-001** (local dev compile/memory): unchanged — still performance watch list; e2e passing does not prove fast first compile.
- **BUG-004** (polluted homepage): unchanged — operator may still run `npm run reset:impronta-homepage:draft -- --apply` before subjective human passes.
- **BUG-005** (publish trust vs wrong canvas): roadmap work landed copy/tooltip honesty and preflight slices per [builder-execution-plan-2026.md](./builder-execution-plan-2026.md) changelog; **full publish/reopen trust** remains **human-gated** on a clean baseline.

Next recommended execution order:

1. Optional: `npm run reset:impronta-homepage:draft -- --apply` (local) for a clean Scenario 2 surface.
2. Human: run **Re-Test Script** § through publish on `localhost:3000/impronta?edit=1`, then **Phase 0** matrix on a **registered** host.
3. Keep `npm run test:e2e:impronta-directory-search-hero` in the loop whenever edit-chrome or homepage render paths change.

## Fix / Retest Update - 2026-05-12, Pass 7 (P0-3 docs + navigator e2e hardening)

Scope:

- **P0-3:** Populate **Deferred bugs** table in [phase-0-qa-registered-host.md](./phase-0-qa-registered-host.md) (BUG-001…008, links back to this run log).
- **E2E:** [`smoke.spec.ts`](../../e2e/smoke.spec.ts) — `expandNavigatorSectionChildList(page, sectionRow, childList)` avoids collapsing already-expanded navigator rows; uses **`[data-navigator-expand-all]`** fallback and `force: true` on the chevron when needed. Documented `test:e2e:impronta-phase0-edit-loop` in the Phase 0 automation command list.

Automated checks:

- `npm run test:e2e:impronta-directory-search-hero` → **Pass** (Chromium).
- `npm run test:e2e:impronta-phase0-edit-loop` → **Pass** (Chromium) for **reorder + reload**; **publish/reopen** is **opt-in** via `PLAYWRIGHT_IMPRONTA_PHASE0_PUBLISH=1` (`npm run test:e2e:impronta-phase0-edit-loop:full`) after a clean draft so preflight blockers on QA-heavy pages do not fail the default command. When publish runs, `awaitPublishDrawerReadyToPublish` waits for preflight, retries **Save draft**, and surfaces **Publish blocked** list text on failure.
- `npx playwright test e2e/smoke.spec.ts -g "impronta navigator layers show child-node metadata"` → **Pass**.

Roadmap:

- `.cursor/plans/builder-phase-truth-roadmap.plan.md` — **`pr-p0-3`** marked **completed**.
