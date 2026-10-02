import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("offer editor re-seeds an existing draft from the shared draft before loading", () => {
  const editor = src("src/components/messages-v5/screens/sheets/OfferEditor.tsx");
  assert.match(editor, /messagingSeedOfferFromShared\(\{ inquiryId, offerId \}\)/);
  assert.match(src("src/lib/server-actions/messaging-offers.ts"), /export async function messagingSeedOfferFromShared/);
});

test("a solo talent catalog never lists the hub roster", () => {
  assert.match(src("src/lib/messages-v5/items-catalog.ts"), /talentProfileId \? Promise\.resolve\(\[\] as CatalogRow\[\]\) : loadTalentRows/);
});

test("quick quote reuses the open draft offer and never hangs on a thrown action", () => {
  const quote = src("src/lib/server-actions/messaging-talent-quote.ts");
  assert.match(quote, /\.eq\("status", "draft"\)/);
  assert.match(quote, /if \(!offerId\)/);
  const panel = src("src/components/admin/shell/internal/talent/agenda/SendQuotePanel.tsx");
  assert.equal((panel.match(/\.catch\(/g) ?? []).length >= 3, true);
});

test("one shared draft order per conversation when seeding a service choice", () => {
  const seed = src("src/lib/messaging/seed-talent-offering-draft.ts");
  assert.match(seed, /\.eq\("source_channel", "messages"\)/);
  assert.match(seed, /if \(!orderId\)/);
});

test("pay page has a no-time variant in every locale", () => {
  for (const l of ["en", "es", "fr"]) assert.match(src(`messages/${l}.json`), /"keepSlotNoTime"/);
  assert.match(src("src/app/(public)/pay/[code]/CheckoutView.tsx"), /appointment_no_time/);
});

test("guest chat on the platform host speaks as the talent's public name", () => {
  const view = src("src/app/t/[profileCode]/profile-view.tsx");
  assert.match(view, /publicNameOrGeneric\(displayName\(profile as TalentProfile\)/);
  assert.match(view, /omitPlatformBrand: Boolean\(chatHub\)/);
});

test("record NOW card flips to Cancelled with the chip", () => {
  assert.match(src("src/components/admin/shell/internal/talent/agenda/AgendaBookingRecord.tsx"), /cancelledHere \? "Cancelled" : item\.nowTitle/);
});
