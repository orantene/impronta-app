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
