/**
 * guest-dock-v5.static.test.ts (L13): the guest dock draws the Messages v5
 * client cards through the SAME component and actions the secure link uses,
 * and mints the thread token only where ownership was proven. Checked against
 * the files, not remembered.
 *
 *   1. `GuestConversationBody` routes card rows to `GuestClientCardRow`, and
 *      `GuestClientCards` renders `ClientCard` from components/messages-v5/client
 *      (no second card renderer in the dock).
 *   2. `guest-thread-v5.ts` is server-only, reads through `client-link.ts`
 *      (the link page's own readers) and never imports a writer.
 *   3. `getGuestThreadMessages` loads the extras AFTER `loadOwnedInquiry` and
 *      only on the full load (`afterIso` null).
 *   4. `use-client-card-actions.ts` calls only `messaging-client` actions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("the dock draws v5 card rows through ClientCard, not a second renderer", () => {
  const body = read("app/t/[profileCode]/_chat/GuestConversationBody.tsx");
  assert.match(body, /drawsV5Card\(node\.row\)\s*\?\s*\(\s*<GuestClientCardRow/);
  const cards = read("app/t/[profileCode]/_chat/GuestClientCards.tsx");
  assert.match(cards, /from "@\/components\/messages-v5\/client\/ClientCard"/);
  assert.match(cards, /from "@\/components\/messages-v5\/client\/use-client-card-actions"/);
  assert.doesNotMatch(cards, /ClientOfferCard|ChoicesCard|ClientTimesCard/, "the dock never dispatches cards itself");
});

test("the v5 extras reader is server-only, reads via client-link and writes nothing", () => {
  const src = read("app/t/[profileCode]/_actions/guest-thread-v5.ts");
  assert.match(src, /^import "server-only";/m);
  assert.match(src, /from "@\/lib\/messaging\/client-link"/);
  assert.match(src, /signThreadToken\(/);
  for (const forbidden of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.rpc\(/, /\.delete\(/, /messaging-engine/, /lib\/pos\/draft/]) {
    assert.doesNotMatch(src, forbidden);
  }
});

test("the token rides the full load only, after ownership is proven", () => {
  const src = read("app/t/[profileCode]/_actions/guest-chat-actions.ts");
  const fn = src.slice(src.indexOf("export async function getGuestThreadMessages("));
  const owned = fn.indexOf("await loadOwnedInquiry(");
  const extras = fn.indexOf("loadGuestThreadV5Extras(");
  assert.ok(owned > 0 && extras > owned, "extras load after loadOwnedInquiry");
  assert.match(fn, /input\.afterIso\s*\?\s*null\s*:\s*await loadGuestThreadV5Extras/);
});

test("the shared card actions call only the token-identified client writers", () => {
  const src = read("components/messages-v5/client/use-client-card-actions.ts");
  const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  const actions = imports.filter((p) => p.includes("server-actions"));
  assert.deepEqual(actions, ["@/lib/server-actions/messaging-client"]);
});

test("the guest items reader selects client-safe line columns only (wave 2)", () => {
  const src = read("app/t/[profileCode]/_actions/guest-thread-v5.ts");
  const select = src.match(/from\("order_lines"\)\s*\.select\("([^"]+)"\)/);
  assert.ok(select, "order_lines select present");
  const cols = select![1].split(",").map((c) => c.trim());
  for (const forbidden of ["discount_cents", "discount_label", "tax_cents", "tax_label", "catalog_price_cents_at_add", "operator_user_id", "confirmed_by"]) {
    assert.ok(!cols.includes(forbidden), `${forbidden} never reaches the guest`);
  }
  assert.ok(cols.includes("proposed_by") && cols.includes("confirmed_at"), "author flag columns present");
  // The Items shelf is read only: no write from the shelf.
  const shelf = read("app/t/[profileCode]/_chat/GuestDockItemsShelf.tsx");
  assert.doesNotMatch(shelf, /server-actions|onRemove|onClick/);
});

test("Home draws Your details (not a ClientCard); rename is token-identified", () => {
  const home = read("app/t/[profileCode]/_chat/GuestDockHomeView.tsx");
  assert.match(home, /GuestDockDetailsCard/);
  const card = read("app/t/[profileCode]/_chat/GuestDockDetailsCard.tsx");
  assert.match(card, /messagingClientRename/);
  assert.doesNotMatch(card, /from ["']@\/components\/messages-v5\/client\/ClientCard["']/);
  assert.doesNotMatch(card, /#0f4f3e/);
  const actions = read("lib/server-actions/messaging-client.ts");
  const fn = actions.slice(actions.indexOf("export async function messagingClientRename"));
  assert.match(fn, /await link\(parsed\.data\.token\)/);
  assert.match(fn, /renameClientContact/);
  const writer = read("lib/messaging/client-rename.ts");
  assert.match(writer, /contact_name: name/);
  assert.doesNotMatch(writer, /update\(\{[^}]*contact_email/);
  assert.doesNotMatch(writer, /update\(\{[^}]*contact_phone/);
  const col = read("app/t/[profileCode]/_chat/MiniChatPanelColumn.tsx");
  assert.ok(col.split("\n").length <= 800, `MiniChatPanelColumn is ${col.split("\n").length} lines`);
});

test("token page passes baked expiry onto the client thread (D-MSG-208c)", () => {
  const page = read("app/(public)/c/t/[token]/page.tsx");
  assert.match(page, /threadTokenExpiresAt=\{new Date\(verified\.expiresAtMs\)\.toISOString\(\)\}/);
  const view = read("components/messages-v5/client/ClientThreadView.tsx");
  assert.match(view, /data-client-link-expiry/);
  assert.doesNotMatch(view, /GuestDockDetailsCard/);
});
