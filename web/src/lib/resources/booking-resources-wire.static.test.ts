/**
 * TUL-1375 · every booking path holds the linked resources. Reads source (comments
 * blanked) so a path that drops the hold goes red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const web = join(__dirname, "..", "..", "..");
const code = (p: string) => blankComments(readFileSync(join(web, p), "utf8"));

test("order pipeline (public /book, instant book, appointment picker, POS desk, reservations, carts) adds linked resources to its one atomic batch", () => {
  const src = code("src/lib/orders/purchase.ts");
  const add = src.indexOf("purchaseNeedsWithLinkedResources(admin, { ...input, capacity: stockNeeds })");
  const reserve = src.indexOf("reserveResourceSet(admin, {");
  assert.ok(add > 0 && reserve > add, "linked needs must be added before the single reserve call");
  assert.match(src, /if \(!linkedNeeds\.ok\) \{ await unwind\(/);
});

test("request paths hold resources with the person, and refuse together", () => {
  const hold = code("src/lib/scheduling/reservation-hold.ts");
  assert.match(hold, /if \(input\.inquiryId && input\.offeringId\) \{\s*const ttlSeconds[\s\S]*?holdInquiryResources\(/);
  assert.match(hold, /if \(!resources\.ok\) \{\s*const \{ error: undoErr \} = await admin\.from\("talent_holds"\)\.delete\(\)\.eq\("id", data\.id\);/);
  assert.match(code("src/lib/server-actions/reservation-propose.ts"), /placeReservationHold\(admin, \{[\s\S]*?offeringId,\s*\}\);/);
  assert.match(code("src/lib/server-actions/messaging-client.ts"), /placeReservationHold\(l\.admin, \{[\s\S]*?offeringId: /);
  assert.match(code("src/lib/inquiry/inquiry-intent-engine.ts"), /attachReservationHoldToInquiry\([\s\S]*?holdInquiryResources\(admin, \{/);
});

test("offer acceptance secures resources before the calendar; cancel and request clean-up release them", () => {
  const pay = code("src/lib/messaging/accept-offer-payment.ts");
  assert.match(pay, /async holdResources\(\{ orderId, window \}\) \{[\s\S]*?secureInquiryBookingResources\(c\.admin, \{\s*orderLineId,/);
  const cancel = code("src/lib/scheduling/cancel-booking.ts");
  assert.match(cancel, /releaseInquiryWindowResources\(admin as never, \{[\s\S]*?window: \{ startsAt: b\.starts_at, endsAt: b\.ends_at \}/);
  assert.doesNotMatch(cancel, /includeCommitted: true/);
  const hold = code("src/lib/scheduling/reservation-hold.ts");
  assert.match(hold, /export async function releaseHoldsForInquiry[\s\S]*?releaseBookingResources\(admin, \{ tenantId, operationKey: inquiryResourcesPrefix\(inquiryId\) \}\)/);
});

test("the catalog editor lets a service pick its resources", () => {
  const tab = code("src/components/admin/shell/internal/page-modules/catalog/item-tab-availability.tsx");
  assert.match(tab, /<ItemResourcesSection tenantId=\{tenantId\} offeringId=\{item\.id\} disabled=\{isDraft\} \/>/);
  const actions = code("src/lib/resources/offering-resources-actions.ts");
  assert.match(actions, /assertNotImpersonating\(\)/);
  assert.match(actions, /staff\.tenantId !== tenantId/);
});

test("linking a space auto-creates its pool through the engine RPC; space settings show it", () => {
  const actions = code("src/lib/resources/offering-resources-actions.ts");
  assert.match(actions, /planSpacePoolForLink\(/);
  assert.match(actions, /rpc\("upsert_capacity_pool", \{/);
  assert.doesNotMatch(actions, /from\("capacity_pools"\)\s*\.(insert|upsert|update)/);
  const editor = code("src/components/spaces/SpacesEditor.tsx");
  assert.match(editor, /bookableAtATime/);
});


test("review P2s: tenant-scoped offering read, checked hold delete, stamp cleared, purchase.ts within 800 lines", () => {
  assert.match(code("src/lib/resources/booking-resources.ts"), /from\("talent_offerings"\)\s*\.select\("id, attributes"\)\s*\.eq\("tenant_id", tenantId\)/);
  const hold = code("src/lib/scheduling/reservation-hold.ts");
  assert.match(hold, /const \{ error: undoErr \} = await admin\.from\("talent_holds"\)\.delete\(\)\.eq\("id", data\.id\);/);
  assert.match(code("src/lib/inquiry/inquiry-intent-engine.ts"), /clearInquiryReservationStamp\(admin, /);
  const lines = readFileSync(join(web, "src/lib/orders/purchase.ts"), "utf8").split("\n").length;
  assert.ok(lines <= 801, `purchase.ts has ${lines} lines`);
});

test("reschedule moves request-sourced resources around the engine call", () => {
  const src = code("src/lib/scheduling/reschedule-booking.ts");
  const move = src.indexOf("moveInquiryBookingResources(");
  const rpc = src.indexOf('rpc("reschedule_booking_set"');
  assert.ok(move > 0 && rpc > move, "resources are secured before the calendar moves");
  assert.match(src, /await resourceMove\.finish\(false\)/);
  assert.match(src, /await resourceMove\.finish\(true\)/);
});

test("auto pool + link are one transaction (held RPC), with a graceful fallback", () => {
  const sql = readFileSync(join(web, "..", "supabase", "migrations", "_pending_pm", "20261231419500_link_offering_resources_tul1375.sql"), "utf8");
  assert.match(sql, /FUNCTION public\.link_offering_resources\(/);
  assert.match(sql, /PERFORM public\.upsert_capacity_pool\(/);
  assert.match(sql, /UPDATE public\.talent_offerings/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.link_offering_resources\([^)]*\) TO service_role;/);
  assert.match(code("src/lib/resources/offering-resources-actions.ts"), /rpc\("link_offering_resources"/);
});
