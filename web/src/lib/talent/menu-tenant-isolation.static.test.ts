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

test("menu order engine stamps service payout lane and order calendar lane", () => {
  const source = readFileSync(
    join(SRC, "lib/inquiry/menu-order-engine.ts"),
    "utf8",
  );
  assert.ok(source.includes('booking_sub_type: "service"') || source.includes("booking_sub_type: 'service'"));
  assert.ok(source.includes('calendar_lane: "order"') || source.includes("calendar_lane: 'order'"));
  assert.ok(!source.includes('.from("talent_holds")'));
  assert.ok(!source.includes('.from("talent_bookings")'));
});
