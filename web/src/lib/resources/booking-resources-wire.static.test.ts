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
  const add = src.indexOf("withLinkedResourceNeeds(needs, linked.poolsByOffering");
  const reserve = src.indexOf("reserveResourceSet(admin, {");
  assert.ok(add > 0 && reserve > add, "linked needs must be added before the single reserve call");
  assert.match(src, /if \(!linked\.ok\) \{\s*await unwind\(/);
});

test("request paths hold resources with the person, and refuse together", () => {
  const hold = code("src/lib/scheduling/reservation-hold.ts");
  assert.match(hold, /if \(input\.inquiryId && input\.offeringId\) \{\s*const ttlSeconds[\s\S]*?holdInquiryResources\(/);
  assert.match(hold, /if \(!resources\.ok\) \{\s*await admin\.from\("talent_holds"\)\.delete\(\)\.eq\("id", data\.id\);/);
  assert.match(code("src/lib/server-actions/reservation-propose.ts"), /placeReservationHold\(admin, \{[\s\S]*?offeringId,\s*\}\);/);
  assert.match(code("src/lib/server-actions/messaging-client.ts"), /placeReservationHold\(l\.admin, \{[\s\S]*?offeringId: /);
  assert.match(code("src/lib/inquiry/inquiry-intent-engine.ts"), /attachReservationHoldToInquiry\([\s\S]*?holdInquiryResources\(admin, \{/);
});

test("offer acceptance secures resources before the calendar; cancel and request clean-up release them", () => {
  const pay = code("src/lib/messaging/accept-offer-payment.ts");
  assert.match(pay, /async holdResources\(\{ window \}\) \{[\s\S]*?secureInquiryBookingResources\(/);
  const cancel = code("src/lib/scheduling/cancel-booking.ts");
  assert.match(cancel, /releaseBookingResources\(admin as never, \{[\s\S]*?includeCommitted: true,/);
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
