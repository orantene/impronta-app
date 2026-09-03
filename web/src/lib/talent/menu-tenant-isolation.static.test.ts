import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

/**
 * Menu isolation — workspace catalogue + public menu_board fetcher.
 *
 * Public read RLS on talent_offerings has no tenant predicate, so isolation
 * for workspace Menu rests entirely on explicit `.eq("tenant_id")` plus
 * `.eq("owner_kind", "workspace")` in every load/mutate path. Pin both.
 */

const SRC = resolve(process.cwd(), "src");

test("menu offerings actions always filter tenant_id AND owner_kind=workspace", () => {
  const source = readFileSync(
    join(SRC, "lib/talent/menu-offerings-actions.ts"),
    "utf8",
  );
  assert.ok(source.includes('.eq("tenant_id", tenantId)'));
  assert.ok(source.includes('.eq("owner_kind", "workspace")'));
  assert.ok(source.includes("staff.tenantId !== tenantId"));
  // Workspace rows must clear talent ownership explicitly — that is the only
  // allowed talent_profile_id mention (null), never a load filter.
  assert.match(source, /talent_profile_id:\s*null/);
  assert.equal(/\.(eq|neq)\(\s*["']talent_profile_id["']/.test(source), false);
});

test("menu_board public fetcher scopes by tenant_id and owner_kind=workspace", () => {
  const source = readFileSync(
    join(SRC, "lib/site-admin/server/native-data-block-sources.ts"),
    "utf8",
  );
  assert.ok(source.includes('.eq("tenant_id", tenantId)'));
  assert.ok(source.includes('.eq("owner_kind", "workspace")'));
  // Do not gate menu on roster membership — workspace items have no talent.
  assert.ok(!/loadMenu[\s\S]{0,800}listTalentIdsOnTenantRoster/.test(source));
});

test("the purchase pipeline stamps NO calendar placeholder", () => {
  // INVERTED DELIBERATELY. This case used to require
  // `calendar_lane: "order"` and `starts_at = ends_at = now()` on the menu
  // engine — it pinned the placeholder as if it were a feature.
  //
  // It was a workaround: the calendar demanded a time, and a taco has none, so
  // the engine invented one. The proposal's exit criterion is that the calendar
  // reads fulfilment time instead, so the pipeline must NOT stamp a lane. The
  // guard is kept and reversed rather than deleted, because silently dropping a
  // guard while changing the behaviour it described is how a removed protection
  // looks like a passing suite.
  const source = readFileSync(join(SRC, "lib/orders/purchase.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!source.includes("calendar_lane"), "no calendar lane placeholder");
  assert.ok(!/starts_at[\s:]/.test(source), "no invented start time");
  assert.ok(!source.includes('.from("talent_holds")'));
  assert.ok(!source.includes('.from("talent_bookings")'));
});
