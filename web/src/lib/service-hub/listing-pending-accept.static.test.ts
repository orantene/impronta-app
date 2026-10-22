import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const web = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

test("TUL-1929: the talent page shows pending updates, and the card answers through the existing respond action", () => {
  const page = read("src/app/(workspace)/talent/where-you-appear/page.tsx");
  assert.match(page, /<PendingListingUpdates items=\{data\.pending\}/);
  const card = read("src/components/talent/service-hub/PendingListingUpdates.tsx");
  assert.match(card, /respondToServiceListingAction\(\{ listingId: item\.listingId, accept, talentLowestCents: item\.minAcceptCents \}\)/);
  assert.match(card, /answer\(false\)/);
  assert.match(card, /answer\(true\)/);
  assert.match(card, /data-testid="pending-listing-update"/);
});

test("TUL-1929: the loader reads the changed terms and returns pending listings", () => {
  const src = read("src/lib/talent/service-hub-channels.server.ts");
  assert.match(src, /show_who, client_contact, booking_type/);
  assert.match(src, /pendingListingUpdates\(/);
  assert.match(src, /\.eq\("talent_profile_id", talentProfileId\)/);
});

test("TUL-1929: accepting is talent-owned in the database and the action uses her own session", () => {
  const actions = read("src/lib/service-hub/listing-actions.ts");
  assert.match(actions, /rpc\("respond_workspace_service_listing"/);
  assert.doesNotMatch(actions, /createServiceRoleClient/);
  const sql = read("../supabase/migrations/_pending_pm/20261231419300_workspace_service_listings_tul1367.sql");
  const fn = sql.slice(sql.indexOf("FUNCTION public.respond_workspace_service_listing"));
  assert.match(fn.slice(0, 900), /NOT public\.is_own_talent_profile\(v_l\.talent_profile_id\)/);
  assert.match(fn, /status = 'accepted',[\s\S]*?talent_consented_at = now\(\)/);
  assert.match(fn, /SET status = 'hidden'/);
});

test("TUL-1929: offering or editing a listing rings the talent's bell", () => {
  const actions = read("src/lib/service-hub/listing-actions.ts");
  assert.match(actions, /notifyListingOffered\(\{ listingId: id \}\)/);
  const cat = read("src/lib/notifications/catalog-entries-hub-listing.ts");
  assert.match(cat, /triggers: \["hub\.listing_update_offered"\]/);
  const prod = read("src/lib/notifications/producers/listing-offered-notify.ts");
  assert.match(prod, /type: "hub\.listing_update_offered"/);
  assert.match(prod, /l\.status !== "offered"/);
});
