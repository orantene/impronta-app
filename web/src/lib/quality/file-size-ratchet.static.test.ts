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
  "src/components/edit-chrome/edit-context.tsx": 6148,
  "src/components/edit-chrome/inspectors/style-panel.tsx": 5896,
  "src/components/edit-chrome/navigator-panel.tsx": 4502,
  "src/components/edit-chrome/topbar.tsx": 3453,
  "src/components/edit-chrome/edit-shell.tsx": 2692,
  "src/components/edit-chrome/inspectors/layout-panel.tsx": 2532,
  "src/components/edit-chrome/publish-drawer.tsx": 2250,
  "src/components/edit-chrome/inspector-dock.tsx": 1822,
  "src/components/edit-chrome/page-settings-drawer.tsx": 1459,
  "src/components/edit-chrome/theme-drawer.tsx": 1423,
  "src/components/edit-chrome/command-palette.tsx": 1283,
  "src/components/edit-chrome/assets-drawer.tsx": 1244,
  "src/components/edit-chrome/comments-drawer.tsx": 1144,
  "src/components/edit-chrome/inspectors/site-header/SiteHeaderInspector.tsx": 949,
  "src/components/edit-chrome/inspectors/featured-talent-content.tsx": 900,

  // ── everything else on the suppression list at 2,000+ lines ──────────────
  // Admin shell internals. The largest concentration of god files outside the
  // builder, and the one with no decomposition program running today.
  "src/components/admin/shell/internal/drawers/drawer-shared.tsx": 5615,
  "src/components/admin/shell/internal/state/fixtures.ts": 5149,
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
  "src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx": 4727,
  "src/components/admin/shell/internal/wave2.tsx": 4597,
  "src/components/admin/shell/internal/workspace.tsx": 3559,
  // 2026-08-10 branding-media: +18 Spanish entries for the Brand identity
  // favicon slot + Brand images manager (translations belong in this map).
  // +4: Spanish for the "some services here can't be published" notice the
  // Services panel now shows at OPEN time (stale-draft reconciliation).
  "src/components/admin/shell/internal/dashboard-i18n.ts": 3517,
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
  "src/components/admin/shell/internal/media-page.tsx": 2925,
  "src/components/admin/shell/internal/state/types.ts": 2747,
  "src/components/admin/shell/admin-shell-client.tsx": 2481,
  "src/components/admin/shell/internal/platform.tsx": 2357,
  "src/components/admin/shell/internal/state/context.tsx": 2345,

  // Workspace routes and server actions.
  "src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx": 3747,
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts": 3588,
  // 2026-08-10 branding-media: +12 for the wordmark/favicon in-use delete
  // guard (logic extracted to site-admin/server/brand-library.ts; this is
  // the import + call site + refusal message).
  // 2026-08-11 drive-import: +10 for the empty-folder diagnosis call site
  // (logic lives in site-admin/media/drive-folder-diagnosis.ts).
  // 2026-08-14 media-ownership phase 1: +67 for the ownership stamp on all
  // six writers in this file (legacy upload, bulk assign, staged assign,
  // card promotion, both Drive imports, signed register + crop inheritance).
  "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts": 2271,
  "src/app/t/[profileCode]/profile-view.tsx": 2634,
  "src/components/inquiry/InquiryDrawer.tsx": 2149,

  // Site-admin library and its big characterization suites. Test files grow
  // into god files exactly like source files do, and are just as hard to read.
  "src/lib/site-admin/builder-node/builder-node.test.ts": 3246,
  "src/lib/site-admin/sections/node-presentation-render.test.ts": 2620,
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
