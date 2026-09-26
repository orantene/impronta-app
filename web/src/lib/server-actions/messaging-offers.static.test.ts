/**
 * Static contract: offer create/load/update/send peers must authorize
 * inquiry managers (staff OR active coordinator), not workspace-staff alone —
 * talent inbox Continue → Offer · … was refused with `not_allowed` otherwise.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const offers = readFileSync(join(dir, "messaging-offers.ts"), "utf8");
const engine = readFileSync(join(dir, "messaging-engine.ts"), "utf8");
const guard = readFileSync(join(dir, "../messaging/staff-guard.ts"), "utf8");

const OFFER_WRITERS = [
  "messagingCreateOffer",
  "messagingLoadOfferForEditor",
  "messagingUpdateOfferDraft",
  "messagingReopenOfferForAmendment",
  "messagingCounterOffer",
  "messagingListOffers",
] as const;

function sliceExport(src: string, name: string, nextNames: string[]): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} export missing`);
  const from = src.slice(start);
  let end = from.length;
  for (const next of nextNames) {
    const idx = from.indexOf(`export async function ${next}`, 1);
    if (idx >= 0 && idx < end) end = idx;
  }
  return from.slice(0, end);
}

test("offer writers gate via messagingInquiryManager(inquiryId)", () => {
  assert.match(offers, /from "@\/lib\/messaging\/staff-guard"/);
  assert.match(guard, /requireInquiryManagerAction\(inquiryId\)/);
  for (let i = 0; i < OFFER_WRITERS.length; i++) {
    const name = OFFER_WRITERS[i]!;
    const body = sliceExport(offers, name, OFFER_WRITERS.slice(i + 1) as string[]);
    assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
    assert.doesNotMatch(body, /const g = await staff\(\)/);
  }
});

test("messagingSendOffer gates via messagingInquiryManager", () => {
  const body = sliceExport(engine, "messagingSendOffer", ["messagingGuestDraftAdd"]);
  assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.doesNotMatch(body, /const g = await staff\(\)/);
});

test("seedOfferFromSharedDraft replaces $0 createOffer placeholders, not only empty drafts", () => {
  assert.match(offers, /from "@\/lib\/messaging\/offer-shared-seed"/);
  assert.match(offers, /offerDraftNeedsSharedSeed\(draft\.lines\)/);
  assert.doesNotMatch(
    offers.slice(offers.indexOf("async function seedOfferFromSharedDraft")),
    /if \(!draft \|\| draft\.lines\.length > 0\) return/,
  );
});
