/**
 * max-lines-suppression-enrolment.static.test.ts — closes the hole going
 * forward, for files that are not on the ratchet yet.
 *
 * THE HOLE
 * ────────
 * `eslint.config.mjs` caps files at `max-lines` 800 = error. When a file crosses
 * that line the usual response is `npm run lint:refresh-baseline`, which writes
 * `{"max-lines": {"count": 1}}` into `eslint-suppressions.json`. That count is a
 * count of RULE VIOLATIONS, not of lines, and `max-lines` reports exactly one
 * violation per file no matter how large it gets. So the suppression is
 * satisfied at 801 lines and at 8,001 alike: crossing 800 once buys a file
 * permanent, silent, unlimited growth. 106 files hold that ticket today.
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * It does not measure anything. It asserts a MEMBERSHIP invariant: every file
 * with a `max-lines` suppression is either
 *   (a) enrolled in a line-count ratchet with an explicit budget, or
 *   (b) named in the NOT_YET_ENROLLED list below.
 * A file that crosses 800 in future therefore cannot pick up the suppression and
 * disappear. The author has to choose in the open: give it a budget, or add it
 * here and say so in review.
 *
 * NOT_YET_ENROLLED is a debt register, not an exemption. It only shrinks.
 * Removing an entry means moving that file into a ratchet table, which is one
 * line plus its current `wc -l`.
 *
 * WHY THE SUPPRESSIONS ARE NOT SIMPLY DELETED FOR RATCHETED FILES
 * ──────────────────────────────────────────────────────────────
 * Verified, not assumed: dropping `max-lines` from a ratcheted file's entry and
 * re-running eslint yields a hard error, because the file genuinely is over 800
 * lines. Example, `theme-drawer.tsx` at 1,423 lines:
 *   801:1  error  File has too many lines (1423). Maximum allowed is 800  max-lines
 * The two mechanisms are not redundant and cannot disagree: eslint answers "is
 * this file over 800 at all", which is already yes and already acknowledged; the
 * ratchet answers "how far over, and is that number moving". Deleting the
 * suppressions would mean refactoring 36 files, which is a different PR.
 *
 * Run: node_modules/.bin/tsx --test src/lib/quality/max-lines-suppression-enrolment.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./file-size-ratchet";

/** Ratchet tables, relative to `web/`. Each is the single owner of its files. */
const RATCHET_TABLES = [
  "src/lib/quality/file-size-ratchet.static.test.ts",
  "src/components/edit-chrome/selection-layer-size-ratchet.static.test.ts",
];

/**
 * Files carrying a `max-lines` suppression with no ratchet budget yet.
 *
 * Ordered largest first at the time of writing. Line counts are deliberately
 * NOT recorded here: an unenforced number in a file about unenforced numbers
 * rots, and the only claim this list makes is membership.
 *
 * The three builder files at the top of the list are the ones an open PR is
 * actively editing (#947, social_feed), so enrolling them would have forced an
 * immediate re-baseline on someone else's branch.
 */
const NOT_YET_ENROLLED: readonly string[] = [
  // Held back for in-flight PR #947.
  "src/lib/site-admin/builder-node/render.tsx",
  "src/components/edit-chrome/inspectors/builder-node-content.tsx",
  "src/lib/site-admin/builder-node/registry.ts",
  // Below the 2,000-line enrolment threshold of the first pass.
  "src/components/builder-lab/catalog-row-table.tsx",
  "src/lib/server-actions/admin-inquiries.ts",
  "src/app/t/[profileCode]/_actions/guest-chat-actions.ts",
  "src/lib/site-admin/builder-node/snapshot-slot-bridge.ts",
  "src/lib/site-admin/builder-node/render-output.test.ts",
  "src/components/directory/directory-filters-sidebar.tsx",
  "src/app/(marketing)/integrations/page.tsx",
  "src/components/admin/shell/internal/live-category-fields-editor.tsx",
  "src/app/(marketing)/get-started/page.tsx",
  "src/lib/server-actions/admin-talent-profile-sections.ts",
  "src/app/(workspace)/[tenantSlug]/client/discover/DiscoverShell.tsx",
  "src/lib/server-actions/admin-talent-skills.ts",
  "src/lib/directory/fetch-directory-page.ts",
  "src/lib/inquiry/inquiry-engine-offers.ts",
  "src/lib/bookings/transactions.ts",
  "src/components/talent/media-gallery-drawer.tsx",
  "src/app/(workspace)/[tenantSlug]/client/messages/OfferTab.tsx",
  "src/components/admin/shell/internal/pitch-compose.tsx",
  "src/lib/pitch/pitch-engine.deep.test.ts",
  "src/lib/server-actions/admin-bookings.ts",
  "src/lib/field-engine/resolve-talent-fields.test.ts",
  "src/lib/site-admin/builder-core/templates/registry-actions.ts",
  "src/lib/site-admin/server/pages.ts",
  "src/lib/site-admin/builder-node/render.test.ts",
  "src/lib/site-admin/builder-node/operations.ts",
  "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/TalentEditForm.tsx",
  "src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts",
  "src/lib/site-admin/tokens/registry.ts",
  "src/lib/site-admin/sections/directory/Editor.tsx",
  "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/EditorSections.tsx",
  "src/lib/site-admin/edit-mode/starter-action.ts",
  "src/app/(workspace)/[tenantSlug]/client/messages/DetailsTab.tsx",
  "src/components/talent/services/TalentOfferingsManager.tsx",
  "src/components/admin/shell/internal/messages/shared/machinery-16.tsx",
  "src/lib/site-admin/builder-node/operations.test.ts",
  "src/lib/site-admin/sections/shared/section-template-starters.ts",
  "src/app/(workspace)/[tenantSlug]/admin/work/[id]/page.tsx",
  "src/components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/new-talent-drawer.tsx",
  "src/lib/field-engine/resolve-talent-fields.ts",
  "src/lib/access/capabilities.ts",
  "src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx",
  "src/lib/site-admin/sections/node-presentation.test.ts",
  "src/components/admin/shell/internal/messages/talent-2.tsx",
  "src/components/admin/shell/internal/data-bridge.ts",
  "src/components/admin/shell/internal/field-catalog.ts",
  "src/lib/server-actions/talent-self-profile-sections.ts",
  "src/lib/site-admin/sections/registry.ts",
  "src/lib/inquiry/guest-chat-contract.ts",
  "src/components/admin/shell/internal/messages/shared/machinery-12.tsx",
  "src/lib/site-admin/site-header/actions.ts",
  "src/lib/saas/custom-domain-actions.ts",
  "src/components/details-tab/DetailsTab.tsx",
  "src/lib/pitch/pitch-engine.ts",
  "src/components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/talent-type-picker.tsx",
  "src/lib/reviews/review-actions.ts",
  "src/app/(workspace)/[tenantSlug]/_data-bridge/client-inquiry-details.ts",
  "src/lib/billing/commission.characterization.test.ts",
  "src/lib/site-admin/sections/shared/default-content.ts",
  "src/lib/site-admin/server/sections.ts",
  "src/components/admin/shell/internal/talent-drawers/events.tsx",
  "src/app/(workspace)/[tenantSlug]/_data-bridge/talent.ts",
  "src/lib/dashboard/admin-dashboard-data.ts",
  "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts",
  "src/components/inquiry-cart/InquiryAttachmentsUploader.tsx",
];

/** Files with a `max-lines` entry in the eslint suppressions baseline. */
function suppressedFiles(): string[] {
  const raw = readFileSync(resolve(WEB_ROOT, "eslint-suppressions.json"), "utf8");
  const suppressions = JSON.parse(raw) as Record<string, Record<string, { count: number }>>;
  return Object.entries(suppressions)
    .filter(([, rules]) => rules["max-lines"] !== undefined)
    .map(([file]) => file)
    .sort();
}

/**
 * Budgeted paths, read out of the ratchet tables as text.
 *
 * Reading the source rather than importing it is deliberate: one of the tables
 * lives in `src/components/edit-chrome/`, and a test that imports edit-chrome
 * has to live in edit-chrome. Parsing the keys keeps this guard where it
 * belongs without duplicating the budgets.
 */
function budgetedFiles(): Set<string> {
  const found = new Set<string>();
  for (const table of RATCHET_TABLES) {
    const source = readFileSync(resolve(WEB_ROOT, table), "utf8");
    const dir = table.slice(0, table.lastIndexOf("/") + 1);
    for (const match of source.matchAll(/^ {2}"([^"]+)":\s*\d+,$/gm)) {
      const key = match[1];
      // The edit-chrome table keys entries by name relative to its own folder;
      // this one keys them relative to `web/`. Normalise to the latter.
      found.add(key.startsWith("src/") ? key : `${dir}${key}`);
    }
  }
  return found;
}

test("the tables this guard reads are not empty", () => {
  // Without this, a renamed table or a changed key format would silently make
  // budgetedFiles() empty and the guard below would still pass by falling
  // through to NOT_YET_ENROLLED.
  const budgeted = budgetedFiles();
  assert.ok(
    budgeted.size >= 30,
    `only ${budgeted.size} budgets parsed from ${RATCHET_TABLES.join(", ")}; ` +
      `the key format or a table path probably changed, and this guard is now blind.`,
  );
  assert.ok(suppressedFiles().length > 0, "eslint-suppressions.json parsed to no max-lines entries.");
});

test("every max-lines suppression is ratcheted or on the debt register", () => {
  const budgeted = budgetedFiles();
  const known = new Set([...budgeted, ...NOT_YET_ENROLLED]);
  const unaccounted = suppressedFiles().filter((file) => !known.has(file));

  assert.deepEqual(
    unaccounted,
    [],
    `${unaccounted.length} file(s) carry a max-lines suppression with no size guard:\n` +
      unaccounted.map((f) => `  ${f}`).join("\n") +
      `\n\nA max-lines suppression is {"count": 1}, and that counts violations, not ` +
      `lines, so it never expires no matter how large the file gets. Either give the ` +
      `file a budget in src/lib/quality/file-size-ratchet.static.test.ts (one line ` +
      `plus its current wc -l), or add it to NOT_YET_ENROLLED here and say why in ` +
      `the PR. Do not delete the entry to make this pass.`,
  );
});

test("the debt register only lists files that still need it", () => {
  const budgeted = budgetedFiles();
  const suppressed = new Set(suppressedFiles());

  const alsoBudgeted = NOT_YET_ENROLLED.filter((file) => budgeted.has(file));
  assert.deepEqual(
    alsoBudgeted,
    [],
    `these files are ratcheted AND on the debt register; drop them from ` +
      `NOT_YET_ENROLLED so the register keeps shrinking:\n` +
      alsoBudgeted.map((f) => `  ${f}`).join("\n"),
  );

  const noLongerSuppressed = NOT_YET_ENROLLED.filter((file) => !suppressed.has(file));
  assert.deepEqual(
    noLongerSuppressed,
    [],
    `these files no longer carry a max-lines suppression, so the register entry ` +
      `is stale; remove it:\n` + noLongerSuppressed.map((f) => `  ${f}`).join("\n"),
  );
});
