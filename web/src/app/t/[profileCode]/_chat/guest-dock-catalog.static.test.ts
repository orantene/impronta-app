/**
 * guest-dock-catalog.static.test.ts (L13 Front Door Chat v2 P1 / D-MSG-212):
 * the dock Items tab catalog is browse + the action that fits. Checked against
 * the files, not remembered.
 *
 *   1. `guest-catalog-actions.ts` is a reader: loadItemsCatalog, no POS /
 *      calendar / admissions writers, talent_profiles select is id+code only.
 *   2. Adds go through `messagingClientAddItem` (token, proposedBy client).
 *   3. Buy now is storefront `/book` (service/class) or `/events` (ticket).
 *   4. Tables have no Buy now; Ask is always available.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("the guest catalog action is a reader and never writes POS or calendar", () => {
  const src = read("app/t/[profileCode]/_actions/guest-catalog-actions.ts");
  assert.match(src, /"use server"/);
  assert.match(src, /loadItemsCatalog/);
  assert.match(src, /from\("talent_profiles"\)\s*\.select\("id, profile_code"\)/);
  for (const forbidden of [
    /createDraftOrder/,
    /addLine/,
    /placeReservationHold/,
    /lib\/pos\//,
    /lib\/admissions/,
    /lib\/calendar/,
    /\.insert\(/,
    /\.update\(/,
    /\.upsert\(/,
    /\.delete\(/,
  ]) {
    assert.doesNotMatch(src, forbidden);
  }
});

test("catalog Add to inquiry goes through messagingClientAddItem, talent uses the inquiry cart", () => {
  const src = read("app/t/[profileCode]/_chat/GuestDockCatalog.tsx");
  assert.match(src, /from "@\/lib\/server-actions\/messaging-client"/);
  assert.match(src, /messagingClientAddItem\(\{/);
  assert.match(src, /sessionId: row\.sessionId/);
  assert.match(src, /useInquiryCart/);
  assert.match(src, /cart\.setInCart/);
  assert.doesNotMatch(src, /createDraftOrder|placeReservationHold|from "@\/lib\/pos\//);
  const writer = read("lib/server-actions/messaging-client.ts");
  const add = writer.slice(writer.indexOf("export async function messagingClientAddItem("));
  assert.match(add.slice(0, 1800), /proposedBy: "client"/);
});

test("Buy now is the storefront page for service, class, and ticket; tables have none", () => {
  const src = read("app/t/[profileCode]/_chat/GuestDockCatalog.tsx");
  assert.match(
    src,
    /BUY_HREF: Partial<Record<ItemCategory, string>> = \{ service: "\/book", class: "\/book", ticket: "\/events" \}/,
  );
  assert.doesNotMatch(src, /table:\s*"\//);
  assert.match(src, /onAsk\(/);
  assert.match(src, /catalogAskPrefill/);
});

test("D-MSG-222: the guest catalog offers only people the public directory lists", () => {
  const reader = read("app/t/[profileCode]/_actions/guest-catalog-actions.ts");
  assert.match(reader, /\.eq\("is_publicly_hidden", false\)/);
  assert.match(reader, /\.eq\("is_publicly_listed", true\)/);
  assert.match(reader, /\.is\("deleted_at", null\)/);
  assert.match(reader, /codes\.has\(r\.talentProfileId\)/);
});

test("solo service rows print a money line when priceLabel is set", () => {
  const src = read("app/t/[profileCode]/_chat/GuestDockCatalog.tsx");
  assert.match(src, /data-guest-service-price/);
  assert.match(src, /item\.priceLabel/);
});
