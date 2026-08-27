/**
 * file-size-ratchet.static.test.ts — the repo's line-count budget table.
 *
 * WHAT THIS GUARDS
 * ────────────────
 * `eslint.config.mjs` caps files at `max-lines` 800. 106 files are grandfathered
 * past that cap in `eslint-suppressions.json` as `{"max-lines": {"count": 1}}`,
 * and that count is a count of VIOLATIONS, not of lines — `max-lines` reports
 * exactly one violation whether the file is 801 lines or 8,001. So every file on
 * that list is free to grow forever with a green gate. This table takes the
 * worst of them off that footing by recording an explicit budget per file.
 *
 * The mechanism (both directions, failure copy, liveness check) lives in
 * `./file-size-ratchet.ts`. Only the budgets live here, deliberately: one line
 * per file so a reviewer can see at a glance what each file is allowed.
 *
 * HOW TO REACT WHEN THIS FAILS
 * ────────────────────────────
 *   • "over its recorded budget" → you grew a file that is already a god file.
 *     Extract, or raise the number here in the same commit so the growth is in
 *     the diff.
 *   • "budget is still tight" → you shrank one. Lower the number here so the win
 *     is locked in instead of becoming headroom.
 * Never delete an entry to make the test pass.
 *
 * WHERE THE ENROLMENT LINE WAS DRAWN (2026-08-08)
 * ───────────────────────────────────────────────
 * Of the 106 suppressed files: every `src/components/edit-chrome/**` file over
 * 800 lines (that tree has an active quality program, so the budgets get used),
 * plus every other suppressed file at 2,000 lines or more. Below 2,000 the tail
 * is 70 files long and each entry costs a reviewer an eyeball; the >= 2,000 set
 * is where a silent doubling does real damage. Extending the table downward is a
 * one-line-per-file change plus its current `wc -l`, and is welcome.
 *
 * LANE
 * ────
 * `npm run test:size-ratchet`, wired into both the `ci` aggregate script and
 * `.github/workflows/ci.yml`; `check:ci-lane-parity` proves that pairing rather
 * than trusting it.
 *
 * Run: node_modules/.bin/tsx --test src/lib/quality/file-size-ratchet.static.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { registerFileSizeRatchet } from "./file-size-ratchet";

const TABLE_FILE = "src/lib/quality/file-size-ratchet.static.test.ts";

/**
 * Files whose budgets are owned by a DIFFERENT ratchet table, and which must
 * therefore not appear below. Two tables disagreeing about one file is worse
 * than one table, so the overlap is asserted away rather than left to habit.
 *
 * Owner: `src/components/edit-chrome/selection-layer-size-ratchet.static.test.ts`
 * (PR #1076), which runs in the `test:builder-chrome` lane.
 */
const RATCHETED_ELSEWHERE = [
  "src/components/edit-chrome/selection-layer.tsx",
  "src/components/edit-chrome/canvas-node-children-panel.tsx",
];

/**
 * path relative to `web/` → maximum line count.
 *
 * Baselines are the exact `wc -l` of each file at `origin/main` 2320a64b6. No
 * file was refactored to produce these numbers: this table installs measurement
 * only, so that the extractions that follow are reviewable on their own.
 */
const BUDGETS: Record<string, number> = {
  // ── src/components/edit-chrome/** over the 800-line cap ──────────────────
  // The builder chrome. Live decomposition target of the page-builder 8/10
  // program, so these budgets should move down often and never up quietly.
  // PERF SPINE (save-cycle bridge): `saving` / `pageVersion` /
  // `lastDraftSavedAt` moved OFF the context value into a micro-store, so a
  // routine autosave stops re-rendering every useEditContext consumer. Two
  // shapes of growth come out of that, both recorded here rather than absorbed
  // silently:
  //   +54 edit-context.tsx — the publish plumbing (wrapped setter that mirrors
  //       into a ref + publishes synchronously, three publish effects) and the
  //       comments explaining why undo/redo read the ref instead of the state.
  //   +3..+18 per CONSUMER — each swaps a context read for a bridge hook,
  //       which costs an import line and a hook call. Extraction is not the
  //       remedy for a three-line delta; the point of the guard is that the
  //       growth is visible, and it is.
  //   +6 (builder-leftovers sweep, item 5): destructure + wire
  //       `registerCanvasGeometryDirtyListener` / `notifyCanvasGeometryDirty`
  //       (2 lines) into the value object + its deps array (2+2 lines) so the
  //       anchored toolbar can re-prime its dirty flag while a floating panel
  //       is being dragged. The pub-sub IMPLEMENTATION lives in
  //       use-workspace-panels.ts (already its own module); this is the thin
  //       plumbing the guard's own procedure asks for.
  //   +6 (live-QA #1146 hotfix): `initialDevice` prop + doc comment threaded
  //       into EditProvider's signature and its `device` useState initializer,
  //       so a device-preview iframe's own EditProvider can be seeded with the
  //       tier it represents instead of always defaulting to "desktop".
  //   +9 (nav-link focus + submenu pin): two pieces of view state a canvas
  //       click and the nav panel both need — the clicked link id, and which
  //       submenu is held open while it is edited. Context is the only place
  //       both sides can read it; the state itself lives in
  //       `use-editor-chrome.ts` and the rendering in `nav-submenu-pin.tsx`, so
  //       what lands here is the destructure and the memo entry.
  //   +8 (info-tip program): `tenantLocales` — the tenant-truth locale list
  //       from the server mount, kept SEPARATE from the composition-scoped
  //       `availableLocales` that freeform adapters collapse to one entry.
  //       That collapse is what hid the EN/ES switch on every freeform page.
  //       This is a derived value + two value-object entries, i.e. exactly the
  //       thin plumbing the guard's procedure asks to record rather than extract.
  //   +30 (SHELL-SEL, 2026-08-20): the live-owner normalization. A builder
  //       node's mapped owner section is only valid selection CONTEXT when
  //       that section is live on this surface; on `site_shell` the landmarks
  //       carry the shell's cms_page_sections id while slots is empty, and the
  //       selection-sync hardening wiped every selection one tick after it was
  //       made (the whole shell canvas read as dead). liveSectionIdsRef + the
  //       liveOwnerSectionIdFor helper + the normalized compare in the P7A-2
  //       guard, plus the comments that stop this from regressing.
  // +22 (2026-08-20 canvas-affordance audit): the queueRouterRefresh un-wedge
  // (rAF+timeout fire) and the serverRenderedEditTarget post-save refresh gate.
// +24 (2026-08-21): the reveal-hidden canvas marker effect (data-bn-reveal-hidden)
  // that makes breakpoint-hidden blocks selectable again in the editor.
  "src/components/edit-chrome/edit-context.tsx": 6307,
  // P2 (style-panel reset): D1 deleted the mis-scoped Surface/Custom-color
  // block outright, so this budget goes DOWN, 5896 -> 5809. Lowering locks the
  // reduction in; the guard can never drift back up silently.
  //
  // 5809 -> 5708 (-101), 2026-08-16, the field-kit VISUAL adoption. Two hand-
  // rolled blocks left this file for modules that render the approved mockup:
  //   -38  the quick-styles text list  -> style-panel/QuickStyleCards.tsx
  //   -63  the "Reuse style" card plus the detached grey "Reset … style" link
  //        -> style-panel/StyleFooterRow.tsx (mockup annotation F)
  // Extraction, not budget inflation, is the documented remedy — and it is
  // also what makes the change reviewable, since each new module is one
  // control with its own reasoning at the top.
  //
  // 5708 -> 5560 (-148), 2026-08-17, D4 (the group hierarchy). The budget goes
  // DOWN again — the remedy for this file has never been a bigger number:
  //   -68  six hardcoded section mounts -> ONE <StyleGroupStack>, which reads
  //        style-panel/group-recipes.ts to decide which groups this kind gets
  //   -80  the loose "Visibility" block and the loose "Custom CSS" <details>
  //        -> style-panel/groups/AdvancedGroup.tsx. They sat BELOW every
  //        accordion, in no group at all, which is also why the D5 search
  //        filter could never reach them.
  // +1 (5560 -> 5561): one entry in the exhaustive per-section style-role map
  // for the new `header_language` widget. That map is required to be total by
  // its own guard, so the line cannot be avoided; extracting a 1-line map entry
  // would not reduce anything meaningful.
  // +12 (5561 -> 5573): the Ratio + Custom ratio controls move OUT of the
  // image-only block so every kind can shape a node (the renderer honors
  // ratio kind-agnostically now — it used to drop it on containers, which
  // shipped 0-height cards on two live pages). The move costs a widened
  // media gate for fit/focal-point, an explicit image check on Crop, and two
  // comments recording why the controls are no longer media-gated.
  // +25 (5573 -> 5598): the viewport patcher splits its patch by whether the
  // renderer has a breakpoint lane for each key. Thirty keys do not have one,
  // and writing them into responsive[viewport] saved a value that emitted
  // nothing — the control reported success and the page never changed. They
  // now route to the base style, where they render. Mostly the comment
  // explaining why, which is the part a reader needs.
  // +13 (info-tip program): the Custom CSS helper paragraph became an
  // `InspectorInfoTip` beside the section title (its JSX fragment carries
  // <code> samples, so it is wider than the one-line <span> it replaced), and
  // BOTH "Selected block" headers became `InspectorLabelWithInfo` so the
  // "Device is controlled by the device rail above" sentence stops printing on
  // every single panel. The live override COUNT stays inline; only the
  // explanation moved.
  "src/components/edit-chrome/inspectors/style-panel.tsx": 5623,
  // +7 (builder move affordances): the Structure panel joins the `panels`
  // z-band instead of its hardcoded 80, which sat BELOW the overlay-portal
  // host (83) and let every selection ring / grip / drop line paint across the
  // layer list. One prop plus the comment recording why the exception is gone.
  // +27 (shell hand-off, 2026-08-20): `activateShellRow` — Site header /
  // footer rows select in place only when the node exists in THIS tree;
  // otherwise they open the ShellEditConfirm hand-off dialog (its OWN module;
  // what lands here is the guard, the state, and the mount).
  "src/components/edit-chrome/navigator-panel.tsx": 4539,
  // +68 (info-tip program): `NavLocaleToggle` — the locale switcher for
  // FREEFORM surfaces. Freeform stores one cms_pages row per locale and the
  // public route loads strictly that row, so the in-place ContentLocaleToggle
  // is the wrong control there: switching language has to NAVIGATE to the
  // sibling row. It sits beside its in-place twin deliberately, so the two
  // storage models stay readable as one decision; splitting them into separate
  // modules would hide why there are two.
  // +13 (freeform translation status): the TranslationStatusButton mount
  // beside NavLocaleToggle. The panel, matcher, and server action live in
  // their own modules; this is only the gated call site.
  "src/components/edit-chrome/topbar.tsx": 3456,
  // +4 (slash-command insert): the mount + wiring for the "/" menu only. The
  // plugin, trigger detection, catalog/matcher and menu component all live in
  // their own modules (SlashCommandPlugin, slash-command-trigger,
  // slash-command-catalog, slash-command-menu); this is the call site.
  // +8 (live-QA #1146 hotfix): `iframeSrcForTier(tier)` replaces the single
  // shared `iframeSrc` — every warm-kept device iframe now gets its OWN
  // `?device=<tier>` URL so its OWN EditProvider (a full separate page load,
  // per iframe-child.tsx) can seed `device` correctly instead of always
  // defaulting to "desktop". Fixes the keyboard nudge (and any other
  // device-scoped write) silently landing in the base/desktop bucket
  // whenever performed inside the Tablet/Mobile preview iframe.
  // +6 (builder move affordances): the overlay-portal host swaps its raw
  // z-[83] for the `Z_INDEX.overlayPortal` token, with the comment explaining
  // that this element is a stacking context — so it, not the zIndex values the
  // selection chrome sets on its own children, is what decides whether canvas
  // chrome can cover a floating panel.
  // +6 (carousel edit-mode binding, 2026-08-17): an import, a three-line
  // comment, and one self-closing mount. The BEHAVIOUR — the refcounted
  // registration, the preview suppression, and the slide-follow — lives in
  // carousel-edit-mode-binding.tsx; this file only says where it hangs. It has
  // to hang here because EditShell is the one component present on BOTH the
  // client-canvas and the server-rendered editing paths.
  "src/components/edit-chrome/edit-shell.tsx": 2742,
  // +16 (per-device carousel slides, 2026-08-17): "Slides per view" now writes
  // `responsive[tier]` when a non-desktop viewport is active instead of
  // silently rewriting the desktop base, plus its override dot and reset. The
  // tier mapping and the patch construction live in
  // lib/site-admin/builder-node/carousel-slides-per-view.ts (unit-tested);
  // this file holds only the two calls and the label.
  "src/components/edit-chrome/inspectors/layout-panel.tsx": 2548,
  // +66 (publish-drawer declutter, 2026-08-19): the "What publishing does"
  // essay card collapsed to one consequence line + an ⓘ (the bilingual JSX
  // moved INSIDE the tip, costing indentation, not new copy), and the two
  // heavy cards (What's going live, Builder changes) gained collapsed-by-
  // default disclosures via a local CardToggle. Net lines are wrappers and
  // the auto-open-on-missing-required guard, not new prose.
  // +112 (publish modal overhaul, 2026-08-20): the four-tab strip (Checks /
  // Changes / SEO / Schedule) with its blocker-count badge, the display-gated
  // tab wrappers (panels stay MOUNTED — unmounting PublishPreflight on a tab
  // switch would reset the publish gate to 0 blockers), a ClockIcon, and the
  // Schedule card mount. The schedule FORM itself was extracted to
  // schedule-form.tsx (shared with ScheduleDrawer); what lives here is only
  // the drawer's own tab state and wiring.
  "src/components/edit-chrome/publish-drawer.tsx": 2440,
  // 1826 → 1844 (+18), 2026-08-16, footer inspector parity.
  //   +2  import of <SiteFooterInspector> and its routing predicate
  //   +14 the `isSiteFooterSelected` block: a 4-line const plus the comment
  //       explaining why the footer routes on the LOADED section's type where
  //       the header routes on a synthetic id, and why both go inert on the
  //       freeform site_shell surface
  //   +2  the JSX branch that renders the drawer
  // Not extracted: the routing decision itself already lives in
  // `lib/site-admin/site-footer/selection-id.ts` (pure + tested). What remains
  // here is the dock's own wiring, which is what this file is for; moving two
  // lines of JSX into a module would hide the dispatch table rather than
  // shrink it.
  "src/components/edit-chrome/inspector-dock.tsx": 1849,
  "src/components/edit-chrome/page-settings-drawer.tsx": 1463,
  // +10 (info-tip program): six standing <Helper> paragraphs moved behind ⓘ
  // via `info=` on their FieldLabel; multi-line labels cost more lines than the
  // single-line helpers they replaced, while the panel renders shorter.
  "src/components/edit-chrome/theme-drawer.tsx": 1433,
  "src/components/edit-chrome/command-palette.tsx": 1287,
  // `assets-drawer.tsx` (1,244) is GONE — the pre-unification media library it
  // implemented was fully subsumed by <MediaLibrary>. The left rail's Assets
  // entry point now mounts `assets-library-drawer.tsx`, which is drawer chrome
  // + the crop/upload pipeline + the paged usage scanner and nothing else, so
  // it is far under the 800-line cap and needs no suppression entry at all.
  "src/components/edit-chrome/comments-drawer.tsx": 1144,
  // +34 (WF-6): a fourth tab, "Arrange", plus the `patchRegions` entry on the
  // save bus. The tab's own ~1,040 lines went into four NEW modules under
  // `tabs/` (RegionsTab / regions-zone / regions-item-row / regions-controls /
  // regions-meta), each under the 800-line cap, rather than into this file.
  "src/components/edit-chrome/inspectors/site-header/SiteHeaderInspector.tsx": 983,
  // +4 (info-tip program): ToggleRow gained an optional `info` prop so the
  // availability note could move behind an ⓘ instead of standing under the row.
  "src/components/edit-chrome/inspectors/featured-talent-content.tsx": 904,

  // ── everything else on the suppression list at 2,000+ lines ──────────────
  // Admin shell internals. The largest concentration of god files outside the
  // builder, and the one with no decomposition program running today.
  "src/components/admin/shell/internal/drawers/drawer-shared.tsx": 5615,
  // 2026-08-18 Website pages data enrichment (P1-B): +29 for the bridge merge
  // projecting locale / SEO flags / page roles / 30d visits onto WebsitePageRow,
  // plus the null-honest visit mapping. The merge is the seam between the data
  // bridge and shell state, so it has nowhere else to live; the pure helpers it
  // calls are already separate modules.
  // 2026-08-18 Website pages quick actions (P3-A): +4 for passing
  // `system_template_key` through the merge, so the Pages list can stop
  // offering Archive/Delete on the rows the cms_pages guard trigger protects.
  // +3: W3 posts row model — fixture author/tags/hits7d replaced by real
  // locale/hasExcerpt/lastEditedBy projection (comment lines in the merge).
    // Rebase reconciliation (W1 onto W2+W3, 2026-08-18): the Posts, Analytics
  // and domain-registry projections all landed in this file from separate
  // branches, so the true count is their sum, not any one branch's number.
  "src/components/admin/shell/internal/state/fixtures.ts": 5215,
  // +15: surfacing a committed-but-incomplete save on BOTH save paths. The
  // shared handling was extracted into profile-shell-save-feedback
  // (reportProfileShellSaveWarnings); what remains here is two call sites and
  // one import.
  // 2026-08-14 media-ownership phase 3 (two-key grants) — +8: mounting the
  // talent-side "From your agencies" locked-tile panel in the Photos & video
  // section, self-mode only. The panel itself is its own component
  // (components/talent/media-release-panel.tsx) and every query lives in
  // lib/site-admin/server/media-grants.ts; what landed here is one import and
  // one guarded mount.
  // 2026-08-15 media UX deferred pass (B13) — +9: the plan-usage line above
  // the Photos & video section, self-mode only. The line itself is
  // components/talent/media-quota-line.tsx and the numbers come from
  // lib/media/talent-storage-usage.ts; what landed here is one import and one
  // guarded mount.
  // +18: the roster-refresh wiring. The skills/contexts panels persist their
  // own changes, so the card behind the drawer went stale until a manual
  // reload; onSkillsChanged / onContextsChanged and Save & exit's not-dirty
  // early return now queue the (coalesced) refresh. Three call sites plus the
  // comments explaining WHY these paths need it — nothing extractable.
  "src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx": 4754,
  // 2026-08-15 talent-notifications de-mock — net +2. `TalentNotificationsDrawer`
  // rendered a hardcoded MOCK_TALENT_NOTIFS and never read
  // `bridgeUserNotifications`, so a talent saw none of their own rows. The
  // ~78 lines of data model + mock moved OUT to
  // internal/talent-notification-rows.ts (which also owns the bridge → row
  // mapping); the ~80 lines that landed here are rendering only: live-vs-mock
  // source selection, per-row + mark-all read-through to
  // @/lib/notifications/actions, and the deep-link dispatch.
  "src/components/admin/shell/internal/wave2.tsx": 4599,
  "src/components/admin/shell/internal/workspace.tsx": 3559,
  // 2026-08-10 branding-media: +18 Spanish entries for the Brand identity
  // favicon slot + Brand images manager (translations belong in this map).
  // +4: Spanish for the "some services here can't be published" notice the
  // Services panel now shows at OPEN time (stale-draft reconciliation).
  // +5 (2026-08-15, media UX honesty pass B8): three ES_TEXT entries plus a
  // two-line comment, renaming the profile "Cover" slots so they no longer
  // collide with the per-site card face. ES_TEXT is a flat literal map keyed
  // by the English string — new user-facing copy in this tree has nowhere
  // else to live.
  // 2026-08-16 T7/D4 brand-mark removal: +1 for the Spanish entry of the one
  // new user-facing string the Branding drawer's Remove buttons add
  // ("Favicon removed"). ES_TEXT is a flat literal map — a new string has
  // nowhere else to live.
  // 2026-08-18 Website nav single source (P1-A): +3 for the Spanish entries
  // of the sub-nav labels the sidebar now renders through `copy.t()`. The
  // labels live in website-nav.ts, but ES_TEXT is a flat literal map keyed by
  // the English string, so their translations have nowhere else to live.
  // 2026-08-18 Website Design hub + Setup (P2-B): +1 for the Spanish entry of
  // the new "Setup" sub-nav label. Same constraint as the P1-A note above —
  // ES_TEXT is keyed by the English literal, so it cannot live beside the item.
  // 2026-08-18 Website Analytics page (W2): +1 for the Spanish entry of the
  // new "Analytics" sub-nav label — ES_TEXT is keyed by the English literal,
  // so it cannot live beside the nav item.
  "src/components/admin/shell/internal/dashboard-i18n.ts": 3536,
  "src/components/admin/shell/internal/help.tsx": 2968,
  // 2026-08-10 branding-media: +32 for the Brand & site lane (sidebar row,
  // brand filter, workspace-asset guards on crop/reassign/lightbox).
  // 2026-08-14 media-ownership phase 1: +72 for the ownership chip on every
  // tile plus the claim / release bulk actions. The chip itself is a separate
  // component (components/admin/media/media-ownership-chip.tsx) and the
  // queries live in lib/site-admin/server/media-ownership.ts; what landed
  // here is the two handlers and their bulk-bar buttons.
  // 2026-08-14 media-ownership phase 3 (two-key grants) — +19: the plan §6
  // "Shared by talent" lane (release requests). One ActiveView variant, one
  // sidebar nav row and one early return; the queue UI is its own component
  // (components/admin/media/media-release-requests-panel.tsx) and the queries
  // live in lib/site-admin/server/media-release-requests.ts.
  // 2026-08-14 media-ownership phase 4 — +40: the Collections heading in the
  // sidebar (grouping logic itself is pure and lives in lib/media/
  // collections.ts), the shoot-date field in the folder modal, and one line
  // mounting the download control. The download UI is a separate component
  // (components/admin/media/media-download-row.tsx) and the originals policy
  // lives in lib/media/originals-policy.ts.
  // 2026-08-15 media UX deferred pass (B13) — +23: the per-talent plan-usage
  // line in the page header, shown only while the talent filter names one
  // person (the cap is per talent, so a workspace-wide fraction would be
  // invented). One import, one memo resolving the filtered name to a profile
  // id, and one guarded mount; the line and its copy live in
  // components/talent/media-quota-line.tsx + lib/media/quota-line.ts.
  // 2026-08-16 T2 brand-lane uploads: +64. The Brand & site lane was
  // filter-only, and every drop was forced through the talent-assign modal —
  // so a drop there aborted with "No talent on roster to assign to." Added:
  //   +32  uploadBrandFiles() — sequential uploadBrandingMedia loop with
  //        per-file failure collection (it reads/writes this component's
  //        upload state, so extracting it would only move the coupling)
  //   +4   brandUploadProgress state + its progress banner
  //   +6   uploadPurpose derivation + the early branch in processFiles
  //   +22  the comments explaining why the branch must precede the roster
  //        load, and what the lane split means
  // 2026-08-16 media rebuild seam 3: -75. The staging model, the
  // concurrency-4 worker pool, the zip/SVG file-preparation rules and the
  // signed-then-legacy ladder moved to `lib/media/use-media-upload.ts` +
  // `lib/media/media-upload-engine.ts`, where the picker drawer and the
  // branding manager share them. Locked in rather than left as headroom.
  "src/components/admin/shell/internal/media-page.tsx": 2941,
  // 2026-08-15 notification page-targets — +7: `NotificationItem.targetHref`,
  // set when a notification's real destination is a routed page rather than a
  // drawer (payout reversals → /talent/payouts, roster applications →
  // <adminBasePath>/roster/applications). One optional field plus the doc
  // comment that tells the click handler to ignore `targetDrawer` when it is
  // present; the resolution logic lives in
  // components/admin/shell/internal/notification-drawer-targets.ts.
  // +17: RosterTaxonomyChip gains `parent` (every leaf chip carries its own
  // parent_category, because a talent spans several and the roster groups by
  // parent) and `supported` (false when the tenant disabled the term). Both
  // are two-line fields on an existing type plus the doc comments explaining
  // the "why" — nothing extractable.
  // 2026-08-18 Website pages data enrichment (P1-B): +24 for the eight new
  // WebsitePageRow fields and the comments recording what each one means -
  // notably that an undefined visit count is "not in the top 8", not zero.
  // types.ts is the shell's single shared type surface; splitting one row type
  // out of it would cost more in import churn than the lines are worth.
  // 2026-08-18 Website pages quick actions (P3-A): +11 for
  // `WebsitePageRow.systemTemplateKey` and the note recording why a template
  // key stands in for the unprojected `is_system_owned` column.
  // 2026-08-18 Website Analytics honesty pass (W2): +18 for documenting the
  // null-honest `prior` on WebsitePeriodMetrics, the slug/surfaces fields on
  // WebsitePageMetrics, and the WebsiteDailyVisits trend type. The always-zero
  // per-page conversion fields and the never-populated WebsiteTalentMetrics
  // were DELETED; the growth is comments explaining why.
  // Rebase reconciliation (W2 onto W3, 2026-08-18): the Posts row-model fields
  // (#1258) and the Analytics fields above landed in this file from separate
  // branches, so the true count is the sum rather than either branch's number.
    // Rebase reconciliation (W1 onto W2+W3, 2026-08-18): same three branches,
  // same shared type surface — the sum, not any single branch's figure.
  // 2026-08-19 onboarding-honesty fix: +5 for `TalentProfile.isStarterSeed`
  // and the note recording why the setup checklist must not count seeded
  // demo profiles as the operator's own talent.
  "src/components/admin/shell/internal/state/types.ts": 2871,
  "src/components/admin/shell/admin-shell-client.tsx": 2481,
  "src/components/admin/shell/internal/platform.tsx": 2357,
  // 2026-08-15 talent-payout-visibility: +2 for the richer talent payout bridge
  // field (reversed/failed/held legs replacing the held-only totals). The type
  // and every helper live in lib/payments/talent-payout-attention-types.ts;
  // this file only carries the context field and its two exports.
  // +41: setRosterCardTypeDisplay — the roster-card category-block layout
  // setter, kept beside its sibling setRosterCardBadge (same settings blob,
  // same optimistic-persist-reconcile contract) rather than split off alone.
  // +2 (2388 → 2390): `canEditSitePages` on bridgeSessionIdentity, so the
  // Website → Redirects nav link is gated on the same capability its route
  // enforces instead of on a role proxy.
  "src/components/admin/shell/internal/state/context.tsx": 2393,

  // Workspace routes and server actions.
  "src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx": 3747,
  // +6: loadOfferDraft returns createdByName (the lookup itself is extracted to offer-author.ts)
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts": 3594,
  // 2026-08-10 branding-media: +12 for the wordmark/favicon in-use delete
  // guard (logic extracted to site-admin/server/brand-library.ts; this is
  // the import + call site + refusal message).
  // 2026-08-11 drive-import: +10 for the empty-folder diagnosis call site
  // (logic lives in site-admin/media/drive-folder-diagnosis.ts).
  // 2026-08-14 media-ownership phase 1: +67 for the ownership stamp on all
  // six writers in this file (legacy upload, bulk assign, staged assign,
  // card promotion, both Drive imports, signed register + crop inheritance).
  // +102 (2026-08-15): plan count-quota gates on the six net-add upload paths
  // in this file, per the accepted media pricing pass (web/docs/media-pricing-
  // pass-2026-08-15.md §3a). Each gate is a call to checkTalentUploadQuota plus
  // the comment explaining why that path is or is not a net add; the logic
  // itself lives in lib/media/talent-storage-usage.ts, not here.
  // +34 (2026-08-15): Batch A / A8 — the signed-upload quota gate moves BEFORE
  // the signed URL is minted (it ran only after the bytes were already in
  // storage, so a capped talent could burn unbounded storage on refusals), and
  // the register-time backstop now deletes the orphan it refuses. Two call
  // sites plus the comments explaining the ordering; no new logic lands here.
  // 2026-08-16 T8/D5 talent-self documents: +3 net. resolveTalentDocumentAuth()
  // replaces the four copy-pasted staff-only guard + roster-check blocks in the
  // talent-document actions with one dual-auth helper (staff OR profile owner),
  // so the helper and its doc comment cost more lines than the four blocks it
  // deleted returned.
  "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts": 2421,
  // +16 — loads + passes the Pro/Portfolio embeds and press bands (the render
  // chrome itself lives in _shared/TalentExtrasBands.tsx, not here).
  "src/app/t/[profileCode]/profile-view.tsx": 2650,
  // 2026-08-16 T4 attachments off the Server Action body: +123. Files used to
  // ride the submit FormData, which put the whole inquiry behind the ~4 MB
  // body cap while the drawer advertised 10 x 20 MB. Added:
  //   +33  the phase-2 effect that uploads staged files against the created
  //        inquiry id once submit resolves
  //   +75  <AttachmentStatus> — the per-file outcome panel, which is the
  //        entire point: failures used to be swallowed by a server-side
  //         and the user was told everything sent
  //   +15  imports and the comments recording why the FormData append left
  "src/components/inquiry/InquiryDrawer.tsx": 2272,

  // Site-admin library and its big characterization suites. Test files grow
  // into god files exactly like source files do, and are just as hard to read.
  "src/lib/site-admin/builder-node/builder-node.test.ts": 3246,
  //   +18  FORMS-3 rewrote the contact-form file-field case: it used to pin
  //        the operator's own `accept` and `fileMaxSizeMb` verbatim, both of
  //        which were promises nothing kept. It now pins the SERVER's enforced
  //        allow-list, the clamped size, and the multipart encoding that is
  //        the difference between storing the file and dropping it. The three
  //        new negative cases went to
  //        `sections/contact_form/attachment-render.test.ts` rather than here.
  "src/lib/site-admin/sections/node-presentation-render.test.ts": 2638,
  "src/lib/site-admin/server/homepage.ts": 2397,
  "src/lib/site-admin/edit-mode/composition-actions.ts": 2259,
};

test("no file is claimed by two ratchet tables at once", () => {
  for (const path of RATCHETED_ELSEWHERE) {
    assert.ok(
      !(path in BUDGETS),
      `${path} already has a budget in selection-layer-size-ratchet.static.test.ts. ` +
        `Two tables can disagree; keep exactly one owner per file.`,
    );
  }
});

registerFileSizeRatchet(BUDGETS, test, { tableFile: TABLE_FILE });
