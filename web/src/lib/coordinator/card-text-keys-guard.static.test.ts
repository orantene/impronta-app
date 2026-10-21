/**
 * TUL-1691: the masking writer masks only the card payload keys in CARD_TEXT_KEYS. A card that shows
 * free text under any OTHER key would carry a phone or email around the masking. This fails when a
 * payload key the client card READS AS TEXT is neither masked (CARD_TEXT_KEYS) nor listed here as
 * platform-generated / not free text, with the reason.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { CARD_TEXT_KEYS, maskCardPayloadText } from "./contact-masking";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

/** Keys a client card shows that are NOT staff-typed free text. Each needs a reason. */
const NOT_FREE_TEXT: Record<string, string> = {
  total_label: "formatted total (money), built by the platform",
  amount_label: "formatted amount (money), built by the platform",
  deposit_label: "formatted deposit (money), built by the platform",
  balance_label: "formatted balance (money), built by the platform",
  changed_field: "the name of a field that changed (an enum), not typed text",
  by_name: "the display name of the person who made the change, from their profile, not a contact detail",
};

function searchKeys(): string[] {
  const src = read("src/app/(workspace)/[tenantSlug]/client/messages/ClientMessagesShell.tsx");
  const m = src.match(/const CARD_SEARCH_PAYLOAD_KEYS = \[([\s\S]*?)\] as const;/);
  assert.ok(m, "CARD_SEARCH_PAYLOAD_KEYS not found: update this guard if the card search list moved");
  return [...m![1]!.matchAll(/"([A-Za-z_]+)"/g)].map((x) => x[1]!);
}

test("every payload key the client card reads as text is masked, or listed as not free text", () => {
  const keys = searchKeys();
  assert.ok(keys.length >= 6, `expected the known card text keys, found ${keys.join(", ")}`);
  const unaccounted = keys.filter((k) => !CARD_TEXT_KEYS.has(k) && !(k in NOT_FREE_TEXT));
  assert.deepEqual(unaccounted, [], "add the key to CARD_TEXT_KEYS (masked) or to NOT_FREE_TEXT with a reason");
});

test("the keys cards.ts renders as text (title, summary) are masked", () => {
  const cards = read("src/lib/messaging/cards.ts");
  const keys = [...cards.matchAll(/str\(p\.([A-Za-z_]+)\)/g)].map((x) => x[1]!);
  assert.ok(keys.includes("title") && keys.includes("summary"));
  for (const k of keys) assert.ok(CARD_TEXT_KEYS.has(k), `${k} is rendered as text by cards.ts but is not in CARD_TEXT_KEYS`);
});

test("hint (staff-typed guidance on a card) is masked", () => {
  const r = maskCardPayloadText({ hint: "call me 984 123 4567" });
  assert.equal(r.maskedCount, 1);
  assert.deepEqual(r.payload, { hint: "call me [phone hidden]" });
});

test("NOT_FREE_TEXT does not shadow a masked key and has no stale entries", () => {
  for (const k of Object.keys(NOT_FREE_TEXT)) assert.ok(!CARD_TEXT_KEYS.has(k), `${k} is both masked and listed as not free text`);
  const keys = new Set(searchKeys());
  for (const k of Object.keys(NOT_FREE_TEXT)) assert.ok(keys.has(k), `${k} is no longer a card text key: remove it from NOT_FREE_TEXT`);
});

test("literal card payloads that carry typed text use a masked key", () => {
  const client = read("src/app/(workspace)/[tenantSlug]/client/_actions/client-add-talent-actions.ts");
  assert.match(client, /card_payload: \{ text:/);
  assert.ok(CARD_TEXT_KEYS.has("text"));
});
