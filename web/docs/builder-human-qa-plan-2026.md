# Builder Human QA Plan 2026

This plan tests whether the current builder can be used by real people, not only whether the code compiles.

Main QA question for every test:

> Can a non-technical user build, edit, preview, and publish a premium branded page without feeling confused, scared, or blocked?

If the answer is no, record the exact friction point, the screen, the action attempted, the expected behavior, the actual behavior, and the severity.

## Test Goals

1. Confirm the builder supports the full human loop: open, understand, add, edit, reorder, preview, publish, recover.
2. Confirm the builder feels premium: visual, calm, direct, responsive, trustworthy, and not like an internal schema editor.
3. Confirm canvas, navigator, inspector, draft state, preview, and live page stay synchronized.
4. Confirm users understand what is editable and what is not editable.
5. Confirm section insertion works on real tenant pages without refresh-only behavior.
6. Confirm nested composition affordances are honest: true child elements should behave like elements; prop-backed fields should not pretend to be drag/drop layers.
7. Confirm publish and recovery are safe enough for real tenant use.
8. Confirm mobile and tablet editing are usable enough for quick edits.
9. Confirm tenant safety: no wrong tenant data, wrong host routing, or cross-tenant publish risk.
10. Produce a bug log that clearly separates critical product blockers from polish debt.

## Test Environments

- Local canonical tenant: `http://localhost:3000/impronta`
- Local edit URL: `http://localhost:3000/impronta?edit=1`
- Local workspace website admin: `http://localhost:3000/impronta/admin/website`
- Local admin fallback: `http://localhost:3000/impronta/admin`
- Real host QA: `https://improntamodels.com`
- Prototype reference when needed: `https://impronta.tulala.digital/prototypes/admin-shell`

Avoid using prototype behavior as proof that production builder behavior works. The prototype is a visual/product reference. Real QA must happen on tenant pages and publishable builder routes.

## Severity Ratings

| Severity | Meaning | Examples |
|---|---|---|
| Critical | Blocks the core builder loop or risks data/site safety. | Cannot add section; added section appears in navigator but not canvas; cannot publish; publishes wrong content; cross-tenant data risk; builder unusable on mobile; data loss. |
| High | Major trust or usability issue. | Draft/live state unclear; header/footer not editable but UI implies it is; canvas and navigator disagree; revisions unclear; important buttons do nothing; repeated console/network errors. |
| Medium | Noticeable friction that slows users or makes the product feel unfinished. | Copy unclear; drawer awkward; mobile layout cramped; section library hard to scan; inspector labels too technical. |
| Low | Polish issue that does not block the flow. | Spacing inconsistency; minor icon inconsistency; small hover/focus issue; non-blocking visual mismatch. |

## Personas

### Persona A - Non-Technical Agency Owner

Goal: create a homepage and publish it.

Likely behavior:

- Does not understand schemas, payloads, nodes, or bindings.
- Wants things to look beautiful quickly.
- Gets scared if publishing is unclear.
- Expects drag/drop and direct visual editing.
- Judges the builder by trust, speed, and visual quality.

Primary question:

Can this person publish a premium homepage without needing a developer to explain the interface?

### Persona B - Talent Coordinator

Goal: update a page, add a section, change content, and publish.

Likely behavior:

- Needs speed.
- Wants confidence.
- Does not want to break the site.
- Needs clear draft/published status.
- Needs simple recovery if a mistake happens.

Primary question:

Can this person make a safe edit under time pressure and know exactly when it is live?

### Persona C - Designer / Creative Operator

Goal: test visual flexibility.

Likely behavior:

- Wants to move elements.
- Wants layout control.
- Notices spacing, typography, image crop, hierarchy, and mobile behavior.
- Quickly notices if child elements are fake selection only.
- Will compare the product to Wix, Webflow, Shogun, Framer, and modern ecommerce builders.

Primary question:

Does the builder have enough real layout and styling control to build a designed page, not only fill a template?

### Persona D - Mobile-First User

Goal: make a quick edit from a phone or tablet.

Likely behavior:

- Needs large tap targets.
- Needs drawers and controls not to overlap.
- Needs preview/edit controls usable on small screens.
- Needs the publish path to remain visible and safe.

Primary question:

Can this person complete a small edit and publish from mobile without fighting the UI?

### Persona E - Support/Admin Tester

Goal: confirm tenant safety and recovery.

Likely behavior:

- Tests edge cases.
- Tests broken links.
- Tests revisions.
- Tests publish errors.
- Tests legacy routes.
- Checks tenant/host boundaries.

Primary question:

Can support confidently diagnose, recover, and explain builder behavior without exposing tenant data or causing accidental changes?

## Developer QA Checklist

Run these before human testing when the touched scope makes them relevant.

| Check | Command / Method | Pass Criteria | Failure Handling |
|---|---|---|---|
| TypeScript | `npm run typecheck` from `web/` | Passes with no type errors. | Critical if new builder files fail. Fix before human QA. |
| Tenant isolation | `npm run test:tenant-isolation` from `web/` | Passes. | Critical for tenant or routing work. Do not proceed to real-host QA if failing. |
| Builder focused tests | `npm run test:builder-capabilities`, `npm run test:builder-node-bindings`, `npm run test:publish-preflight` | Passes for builder changes. | High/Critical depending on failed area. |
| Lint | Scoped lint on touched files if repo-wide lint still fails from baseline debt. | No new lint errors in touched files. | Do not report global lint debt as a builder-specific regression unless touched files introduce it. |
| Snapshot gate | Published builder pages have required snapshot/builder payload. | No snapshot-null publishable pages. | Critical if a published builder page falls back unexpectedly. |
| Route smoke | `curl -I` or browser check for local/real host routes. | No broken route, no wrong redirect, no wrong tenant. | High/Critical depending on route. |

Technical browser checks:

- No console errors.
- No network errors.
- No hydration errors.
- No broken routes.
- No stale preview.
- No broken publish.
- No drawer stacking.
- No wrong tenant data.
- No canvas/navigator mismatch.
- No hidden fatal errors after save/publish.

## Browser QA

Use the browser as a user would. Developer tools can be open, but the test result must be based on the human product experience.

Record:

- URL.
- Browser.
- Viewport size.
- Tenant.
- User role.
- Page being edited.
- Exact action.
- Expected result.
- Actual result.
- Screenshot or screen recording when possible.
- Console/network issue if visible.

Do not count a flow as passed if it only works after a hard refresh unless the expected behavior explicitly says a refresh is required.

## Real Tenant QA

Use Impronta as the canonical QA tenant.

Real tenant checks:

1. Log in as an Impronta admin/operator.
2. Open `http://localhost:3000/impronta/admin/website`.
3. Enter builder/edit mode from the Website area.
4. Confirm the URL remains tenant-scoped.
5. Confirm the edited page is the Impronta page, not a prototype shell.
6. Confirm roster/location/taxonomy-backed sections use Impronta data.
7. Publish a controlled visible change.
8. Confirm the live page on local and real host updates.
9. Confirm no other tenant is affected.
10. Restore or revert the test change.

Failure signs:

- Website admin links to prototype-only routes.
- Edit mode loses tenant auth.
- Builder opens a host that does not share auth cookies.
- Data shown belongs to another tenant.
- Publish changes the wrong page.
- Live page differs from editor output.

## Human Test Scorecard

Each tester should complete this scorecard after the scripted tests.

| Area | Score 1-5 | Notes |
|---|---:|---|
| First impression |  |  |
| Ease of understanding |  |  |
| Visual quality |  |  |
| Add section flow |  |  |
| Editing text |  |  |
| Reordering sections |  |  |
| Inspector clarity |  |  |
| Mobile usability |  |  |
| Publish confidence |  |  |
| Recovery confidence |  |  |
| Overall premium feel |  |  |

Ask every tester:

1. What confused you?
2. What felt broken?
3. What felt slow?
4. What felt premium?
5. What felt cheap or unfinished?
6. What did you expect to be able to do but could not?
7. Were you scared to publish?
8. Did mobile feel usable?
9. Did you understand what was selected?
10. Would you feel comfortable using this without a developer?

## Scenario 1 - First-Time User Opens Builder

Purpose: test orientation, trust, and first impression.

Persona focus: A, B, D.

Steps:

1. Log in as a tenant user.
2. Open the workspace Website area.
3. Enter visual edit mode.
4. Identify what page is being edited.
5. Identify what is draft vs published.
6. Click around the canvas, navigator, and inspector.
7. Find the add-section path.
8. Find the preview/publish path.

Questions:

- Does the user understand where they are?
- Do they understand what they can edit?
- Is there a clear path to add/edit/publish?
- Are there confusing labels?
- Does the UI feel premium or internal/admin-like?

Expected result:

- The user understands the builder within 60-90 seconds.
- The page name, selected surface, draft/live state, and publish path are clear.
- Canvas, navigator, and inspector all communicate the same selection.

Failure signs:

- User cannot identify the page.
- User cannot tell whether changes are live.
- Buttons appear dead or ambiguous.
- Labels sound like schemas or internal engineering objects.
- UI feels like an admin debug panel instead of a premium builder.

Severity:

- Critical if the user cannot enter edit mode.
- High if draft/live state or page identity is unclear.
- Medium if labels are awkward but flow is possible.

What to record:

- Time to orientation.
- First confusing label.
- First action the user attempts.
- Whether the user finds add/edit/publish without help.

Suggested fixes if failed:

- Add clearer page title and draft/live status in the topbar.
- Add selected-node breadcrumb in inspector.
- Rename technical labels.
- Reduce visual clutter in navigator.
- Make primary add/edit/publish actions more visually dominant.

## Scenario 2 - Add a New Section

Purpose: verify the critical builder loop and catch the known risk where a new section appears in navigator but not canvas.

Persona focus: A, B, C.

Steps:

1. Open a real CMS page in edit mode.
2. Click add section.
3. Insert a hero, CTA, gallery, or text section.
4. Confirm it appears in the navigator.
5. Confirm it appears visibly on the canvas.
6. Confirm the canvas scrolls to or highlights the new section.
7. Confirm the inspector updates to the new section.
8. Edit the new section.
9. Save, preview, or publish.

Expected result:

- New section appears in both navigator and canvas.
- No hard refresh is required.
- User can immediately see and edit the section.
- Canvas and navigator stay synchronized.
- Inspector selects the inserted section.

Failure signs:

- Section appears in navigator only.
- Canvas does not update.
- User has to refresh.
- Inspector selects the wrong section.
- Section appears below fold without scroll/highlight.
- New section appears but styling is broken.

Severity:

- Critical if reproducible.

What to record:

- Section type inserted.
- Whether it appeared in navigator.
- Whether it appeared on canvas.
- Whether it was selected.
- Whether refresh changed the outcome.
- Console/network errors.

Suggested fixes if failed:

- Audit optimistic insert pipeline.
- Confirm builder state and canvas render state share the same source.
- Force post-insert selection and scroll target.
- Add insert confirmation/highlight.
- Add regression test for insert-to-canvas sync.

## Scenario 3 - Edit Existing Text Inline

Purpose: confirm editing feels like editing a live page.

Persona focus: A, B, C.

Steps:

1. Select a headline on the canvas.
2. Edit the headline text.
3. Edit subheadline text.
4. Edit CTA label.
5. Add or edit a link.
6. Confirm no raw markers appear.
7. Save.
8. Refresh.
9. Preview visitor mode.

Expected result:

- Editing feels direct and clear.
- Text changes persist after refresh.
- Preview shows updated content.
- Text does not jump, lose formatting, or display raw markers.

Failure signs:

- User must use only inspector forms when inline editing is visually implied.
- Text edits disappear.
- Formatting breaks.
- Toolbar is confusing.
- Selection is unstable.

Severity:

- Critical if edits disappear.
- High if selection or save is unreliable.
- Medium if inline editing is unavailable but clearly documented.

What to record:

- Which field was edited.
- Whether edit happened inline or inspector-only.
- Whether save/refresh preserved it.
- Any formatting changes.

Suggested fixes if failed:

- Clarify inline vs inspector editing.
- Add save status near edited text.
- Stabilize selected node mapping.
- Add dirty-state warning before navigation.

## Scenario 4 - Reorder Sections

Purpose: confirm section order is trustworthy.

Persona focus: B, C.

Steps:

1. Move a section using the navigator.
2. Move a section using canvas controls if available.
3. Confirm navigator and canvas show the same order.
4. Undo the move.
5. Redo or move again.
6. Preview.
7. Publish if the preview is correct.

Expected result:

- Reorder is smooth.
- Navigator and canvas remain aligned.
- Undo works.
- No layout breaks.

Failure signs:

- Canvas order and navigator order differ.
- Section jumps unexpectedly.
- Undo breaks the page.
- Drag/drop feels unclear.
- Move buttons appear clickable but do nothing.

Severity:

- Critical if reorder cannot work at all.
- High if surfaces disagree.
- Medium if drag/drop is unclear but buttons work.

What to record:

- Start order and final order.
- Method used: drag/drop, up/down buttons, canvas control.
- Whether undo worked.
- Whether publish preserved order.

Suggested fixes if failed:

- Route all section moves through one operation pipeline.
- Disable unavailable move actions with clear tooltips.
- Add movement animation or target indicator.
- Add order integrity tests.

## Scenario 5 - Test Child-Element Expectations

Purpose: confirm nested composition affordances are honest and useful.

Persona focus: C.

Steps:

1. Select a Hero section.
2. Select Headline.
3. Select Subheadline.
4. Select CTA.
5. Try to reorder headline/subheadline/CTA.
6. Try to add a new button.
7. Try to add or change image/background.
8. Try to switch layout from centered to split.
9. Try to change image left/right.
10. Repeat on CTA, Gallery, Slider, Testimonial, Talent Grid, and Contact sections.

Questions:

- Is the UI honest about what is editable?
- Does it imply more freedom than the model supports?
- Are controls labeled as field editing when they are only fields?
- Are true child elements clearly different from prop-backed fields?

Expected result:

- User understands what can and cannot be moved.
- The UI does not show Webflow/Figma-level affordances unless the section supports them.
- Layout controls are honest and specific.

Failure signs:

- User thinks headline can be dragged but it cannot.
- UI shows child layers that are not real layout elements.
- User expects to add elements but only fields exist.
- Layout tab cannot control child order but visually implies it can.

Severity:

- High if the builder consistently over-promises nested editing.
- Medium if only one section is misleading.

What to record:

- Which section was tested.
- Which child item was selected.
- What the user expected.
- What the builder allowed.
- Whether labels or controls caused the expectation.

Suggested fixes if failed:

- Separate "Fields" from "Elements" in navigator.
- Use honest labels: content fields, layout slots, real child nodes.
- Hide drag handles for non-movable children.
- Add true BuilderNode support before exposing nested drag/drop affordance.

## Scenario 6 - Change Section Design/Style

Purpose: confirm visual authoring feels premium and immediate.

Persona focus: A, C.

Steps:

1. Select a section.
2. Change background color.
3. Change background image if available.
4. Change overlay if available.
5. Change spacing/padding.
6. Change alignment.
7. Change CTA style.
8. Change image crop/focal point if available.
9. Preview desktop, tablet, and mobile.

Expected result:

- Visual controls are clear.
- Changes appear immediately or with clear save feedback.
- Section remains visually premium.
- Contrast and spacing remain usable.

Failure signs:

- Controls feel like developer fields.
- Changes do not apply.
- Mobile breaks.
- Style controls are too thin or unclear.
- Image crop is unpredictable.

Severity:

- High if changes do not apply or mobile breaks.
- Medium if controls are confusing but output works.
- Low for small visual mismatches.

What to record:

- Control changed.
- Visible result.
- Breakpoint tested.
- Before/after screenshot.

Suggested fixes if failed:

- Add live preview for style changes.
- Group style controls by outcome: background, layout, typography, media, actions.
- Add reset per property.
- Add contrast and overflow warnings.

## Scenario 7 - Responsive Testing

Purpose: validate both editor UI and visitor output across device sizes.

Persona focus: C, D.

Test viewports:

- 390px mobile
- 820px tablet
- 1440px desktop

Steps:

1. Open builder at each size.
2. Use navigator.
3. Select sections.
4. Open inspector.
5. Add a section.
6. Edit text.
7. Open publish drawer.
8. Preview visitor mode.
9. Check header/footer.
10. Check forms, cards, galleries, CTAs, and hero.

Expected result:

- No horizontal scroll.
- Controls are usable.
- Drawers do not block everything.
- Tap targets are usable.
- Mobile output looks intentional.
- Text does not overflow.
- Images crop acceptably.
- CTAs remain visible.

Failure signs:

- Buttons cut off.
- Drawers unusable.
- Controls overlap canvas.
- Text breaks.
- Mobile preview differs from real mobile output.
- User cannot complete a basic edit on mobile/tablet.

Severity:

- Critical if mobile builder is unusable for basic edit/publish.
- High if visitor output breaks.
- Medium if editor is cramped but usable.

What to record:

- Viewport size.
- Device/browser.
- Screenshot of editor and preview.
- Any blocked action.

Suggested fixes if failed:

- Add mobile-specific drawer behavior.
- Increase tap targets.
- Collapse secondary controls.
- Add breakpoint-specific layout controls.
- Add overflow diagnostics before publish.

## Scenario 8 - Publish Trust Test

Purpose: confirm publishing feels safe and understandable.

Persona focus: A, B, E.

Steps:

1. Make a visible change.
2. Confirm draft/unpublished state is clear.
3. Open publish drawer.
4. Read preflight results.
5. Identify blocking vs advisory warnings.
6. Publish.
7. Confirm live page updates.
8. Confirm success message.
9. Confirm no stale cache.
10. Test a publish failure if possible.

Expected result:

- User knows what will publish.
- Warnings are understandable.
- Blocking issues are clearly different from suggestions.
- Success/failure messages are clear.
- Published output matches editor output.

Failure signs:

- User is unsure if the site is live.
- User is scared to publish.
- Warnings are too technical.
- Publish succeeds but live page does not update.
- Header/footer/cache stale behavior.

Severity:

- Critical if publish fails, publishes wrong content, or live output differs.
- High if state/warnings are unclear.
- Medium if copy is awkward.

What to record:

- Draft state before publish.
- Preflight warnings.
- Publish result.
- Live URL checked.
- Cache/staleness behavior.

Suggested fixes if failed:

- Add clearer draft/live status.
- Improve preflight copy.
- Add post-publish link to live page.
- Add cache invalidation confirmation.
- Add publish failure recovery steps.

## Scenario 9 - Revisions and Recovery

Purpose: confirm users trust the recovery path.

Persona focus: B, E.

Steps:

1. Publish a version.
2. Make changes.
3. Publish again.
4. Open revisions.
5. Understand available restore options.
6. Restore a previous version.
7. Confirm restored output.
8. Confirm user understands undo vs revision restore.

Expected result:

- Restore feels safe.
- Copy is clear.
- User knows restore affects page history, not just current session.
- No accidental destructive action.

Failure signs:

- User does not understand what will be restored.
- Restore copy is vague.
- No confidence in recovery.
- Undo and revision restore are confused.
- Restored output differs from selected revision.

Severity:

- Critical if restore corrupts or loses data.
- High if restore is unclear or not trusted.
- Medium if copy needs polish.

What to record:

- Revision selected.
- Restore confirmation text.
- Output before/after restore.
- User confidence score.

Suggested fixes if failed:

- Add revision preview.
- Add clearer restore confirmation.
- Separate session undo from published revision restore.
- Add recovery success toast with live preview link.

## Scenario 10 - Header/Footer Shell Test

Purpose: document whether the shell is editable and whether expectations are honest.

Persona focus: A, C, E.

Steps:

1. Try to select header.
2. Try to edit logo.
3. Try to edit nav links.
4. Try to edit header CTA.
5. Try to edit mobile menu.
6. Try to select footer.
7. Try to edit footer columns, legal links, social/contact.
8. Publish.
9. Confirm shell updates across pages.

Expected result if implemented:

- Header/footer are selectable and editable.
- Publish updates all pages.
- No stale shell cache.

Expected result if not implemented:

- UI does not imply the shell is fully editable.
- Limitation is visible and documented.
- User can still understand page body editing.

Failure signs:

- User expects full site editing but can only edit page body.
- Header/footer controls are hidden or confusing.
- Shell changes do not publish across routes.
- Shell selection exists but inspector cannot change meaningful values.

Severity:

- High if UI implies full shell editing but it is not available.
- Critical if shell publish affects wrong tenant or wrong pages.
- Medium if limitation is clear but workflow is incomplete.

What to record:

- Whether shell is selectable.
- What fields are editable.
- Whether publish updates all relevant pages.
- Any mismatch between labels and actual capability.

Suggested fixes if failed:

- Add explicit shell editing mode.
- Add shell scope label: "Global header/footer".
- Add page-body-only limitation where relevant.
- Add publish impact summary.

## Section Insertion and Editing Matrix

Use this matrix for every section type available in the library.

| Section Type | Insert Appears In Navigator | Insert Appears On Canvas | Auto-Selected | Editable Content | Editable Style | Responsive OK | Publish OK | Notes |
|---|---|---|---|---|---|---|---|---|
| Hero |  |  |  |  |  |  |  |  |
| CTA |  |  |  |  |  |  |  |  |
| Gallery |  |  |  |  |  |  |  |  |
| Text/Rich content |  |  |  |  |  |  |  |  |
| Talent Grid |  |  |  |  |  |  |  |  |
| Location/Map |  |  |  |  |  |  |  |  |
| Testimonial |  |  |  |  |  |  |  |  |
| FAQ |  |  |  |  |  |  |  |  |
| Contact/Form |  |  |  |  |  |  |  |  |
| Slider/Carousel |  |  |  |  |  |  |  |  |

## Nested Composition Testing

Run this on every section that exposes child rows, layers, slots, or nested elements.

| Test | Expected Result | Failure Sign | Severity |
|---|---|---|---|
| Select parent section | Parent is selected in canvas, navigator, and inspector. | Inspector shows a child or stale node. | High |
| Select child | Child path is clear. | User cannot tell what is selected. | High |
| Move child | Works only if child is a real movable element. | Drag handle appears but does nothing. | High |
| Add child | New child appears on canvas and navigator. | Child appears only in one surface. | Critical |
| Delete child | Delete is clear, recoverable, and scoped. | Deletes wrong item or no confirmation for risky item. | Critical |
| Change child style | Change applies to selected child only. | Parent or wrong sibling changes. | High |
| Undo child edit | Returns exact previous state. | Undo changes wrong node. | High |
| Publish nested change | Live output matches editor. | Published page differs. | Critical |

## Accessibility Testing

Accessibility is part of premium trust. The builder should be usable with keyboard, readable by assistive technology, and capable of warning authors about visitor-facing accessibility issues.

Editor a11y checks:

1. Navigate topbar, navigator, canvas selection controls, inspector, drawer, and publish flow with keyboard.
2. Confirm focus indicators are visible.
3. Confirm selected item is announced or clearly indicated.
4. Confirm dialogs trap focus and close predictably.
5. Confirm icon-only buttons have labels/tooltips.
6. Confirm destructive actions have accessible confirmation.
7. Confirm color contrast in the editor is readable.

Page-output a11y checks:

1. Headings follow a logical order.
2. Images require alt text or decorative marking.
3. Links and CTAs have meaningful labels.
4. Forms have labels and error states.
5. Section background/foreground contrast passes.
6. Mobile reading order is logical.

Failure signs:

- Keyboard user cannot publish.
- Focus disappears.
- Icon buttons are unlabeled.
- Generated page has missing alt text or broken heading structure without warning.

Severity:

- Critical if keyboard user cannot complete the core builder loop.
- High if visitor-facing accessibility issues can be published silently.
- Medium for unclear labels or weak focus states.

## Publish and Recovery Testing

Run this before any pilot user gets access.

| Test | Steps | Pass Criteria | Failure Severity |
|---|---|---|---|
| Save draft | Make change, save, refresh. | Draft persists. | Critical if lost. |
| Publish page | Publish visible change. | Live page matches editor. | Critical if mismatch. |
| Publish with warning | Create advisory issue, publish if allowed. | Warning is understandable. | High if confusing. |
| Publish with blocker | Create blocking issue if possible. | Publish is blocked with clear fix. | Critical if unsafe publish proceeds. |
| Recovery | Restore previous revision. | Previous version returns exactly. | Critical if corrupted. |
| Cache | Check live host after publish. | No stale content after expected refresh. | High if stale. |
| Wrong tenant guard | Attempt route/host edge case. | No cross-tenant data/change. | Critical. |

## Real-Host QA Checklist

Use this after local QA passes.

1. Confirm current deployed commit/branch.
2. Open `https://improntamodels.com`.
3. Open authenticated admin route if available.
4. Enter edit mode.
5. Confirm Impronta tenant identity and data.
6. Add a safe test section.
7. Confirm canvas/navigator/inspector sync.
8. Edit text and style.
9. Preview desktop/tablet/mobile.
10. Publish.
11. Confirm live host updates.
12. Confirm `https://impronta.tulala.digital` behavior if it is expected to alias the same tenant.
13. Confirm `www.tulala.digital` is not incorrectly showing Impronta-only admin data.
14. Restore/revert the test change.
15. Log all failures.

Pass criteria:

- Live host routes resolve.
- Tenant data is correct.
- Add/edit/publish loop works.
- No wrong-tenant data.
- Published output matches editor.

## Bug Log Template

Use one row per issue.

| ID | Date | Tester | Persona | Environment | URL | Viewport | Scenario | Severity | Steps to Reproduce | Expected | Actual | Evidence | Suggested Fix | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BUG-001 |  |  |  |  |  |  |  |  |  |  |  |  |  |  | New |

Required evidence:

- Screenshot or recording for visual/UI issues.
- Console/network note for browser errors.
- Tenant/user role for tenant issues.
- Before/after URL for routing issues.
- Published/live URL for publish issues.

## Pass/Fail Gates

### Internal QA Pass

Pass only if:

- Core add/edit/reorder/publish loop works.
- No critical issues remain open.
- `npm run typecheck` passes.
- `npm run test:tenant-isolation` passes when tenant/routing scope changed.
- Real-host QA completed.
- Known issues are documented with severity and owner.

Fail if:

- Any critical issue remains.
- Add section is not visible on both navigator and canvas.
- Publish output cannot be trusted.
- Tenant safety is uncertain.

### Pilot User Pass

Pass only if:

- No critical issues remain.
- No more than two unresolved high issues remain.
- Publish feels safe to testers.
- Mobile/tablet/desktop are tested.
- Section library is usable.
- Support/admin team knows current limitations.

Fail if:

- A non-technical tester cannot add/edit/publish without help.
- Draft/live state is unclear.
- Revisions or restore path is too scary or vague.
- Mobile users cannot complete a basic edit.

### Premium Self-Serve Pass

Pass only if:

- No critical issues remain.
- No unresolved high issues in core flows.
- Header/footer are editable or clearly handled.
- Responsive authoring is strong.
- Publish/recovery is clear.
- Human testers rate overall premium feel 4/5 or higher.
- Human testers can complete homepage creation without developer help.

Fail if:

- Builder still feels like an internal admin tool.
- Nested composition controls are misleading.
- Responsive output requires developer cleanup.
- User confidence to publish is below 4/5.

## Pilot-User Readiness

Before pilot users:

1. Freeze the test tenant content or create a safe duplicate page.
2. Prepare restore point/revision.
3. Give testers a task, not a feature tour.
4. Record session if possible.
5. Do not explain the UI unless the tester is blocked.
6. Ask the tester to think aloud.
7. Let confusion happen and document it.
8. Triage immediately after each session.

Minimum pilot readiness:

- Add/edit/publish works.
- No tenant safety risk.
- Recovery is available.
- Known limitations are written in plain language.
- Support knows how to revert a bad publish.

## First QA Run Recommendation

Run the first QA pass in this order:

1. Developer smoke test on registered tenant host.
2. Product owner test using the 10 scenarios above.
3. Designer/creative test focused on visual flexibility and nested composition expectations.
4. Non-technical user test focused on add/edit/publish.
5. Mobile-only test.
6. Final bug triage.

The first QA run must pay special attention to:

- Add section appears in navigator but not canvas.
- Canvas/navigator synchronization.
- Draft vs published clarity.
- Publish confidence.
- Mobile usability.
- Whether child-element selection feels honest or misleading.

## Suggested Tester Order

| Order | Tester Type | Why |
|---:|---|---|
| 1 | Internal developer | Catch technical blockers before wasting human tester time. |
| 2 | Product owner | Validate product intent, labels, confidence, and roadmap fit. |
| 3 | Designer/creative user | Stress visual flexibility and nested composition honesty. |
| 4 | Non-technical user | Validate real self-serve usability. |
| 5 | Mobile-first user | Confirm quick-edit workflows on small screens. |
| 6 | Support/admin user | Validate recovery, tenant safety, and troubleshooting readiness. |

## Human QA Script Template

Use this script at the start of each test:

> You are testing whether this builder lets you create or update a real premium page without a developer. Please speak out loud as you work. I will not explain the interface unless you are fully blocked. Try to complete the task as you naturally would.

Task template:

1. Open the builder.
2. Tell us what page you think you are editing.
3. Add a new section.
4. Change text and one visual style.
5. Reorder one section.
6. Preview mobile.
7. Publish or explain why you would not feel safe publishing.
8. Restore or undo one change.

Observer rules:

- Do not lead the tester.
- Record hesitation longer than 10 seconds.
- Record every dead click.
- Record every moment where the tester asks "Is this live?" or "Did it save?"
- Record every mismatch between what the user expects and what the builder supports.

## Final QA Decision Template

After a QA run, summarize:

1. Overall pass/fail.
2. Whether the main QA question passed.
3. Number of critical, high, medium, and low issues.
4. Top three trust blockers.
5. Top three visual/premium blockers.
6. Top three engineering blockers.
7. Whether pilot users can test safely.
8. Whether the product is ready for premium self-serve.

Decision language:

- "Ready for internal QA" means developers and product owner can keep testing.
- "Ready for pilot users" means real users can test with support watching and recovery available.
- "Ready for premium self-serve" means a non-technical user can build, edit, preview, publish, and recover without developer help.
