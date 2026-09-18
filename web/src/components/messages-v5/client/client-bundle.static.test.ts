/**
 * client-bundle.static.test.ts (L9): the client link thread is its own
 * surface. Checked against the files, not remembered:
 *
 *   1. Nothing under components/messages-v5/client/** imports from the staff
 *      screens (`components/messages-v5/screens/**`), the staff shell
 *      (`components/messages-v5/shell/**`), the admin shell
 *      (`components/admin/**`) or the staff server actions
 *      (`messaging-engine`, `messaging-offers`, `messaging-money-actions`,
 *      `messaging-confirm`, `messaging-sheets`).
 *   2. The client card payload readers and the client offer type carry no
 *      staff-only money field (net / commission / payout / discount / tax /
 *      talent cost / authorship columns).
 *   3. The token page renders the v5 client thread through the client
 *      reader, and every client action verifies the token first.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const clientFiles = readdirSync(HERE).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith("test-"));

const FORBIDDEN_IMPORTS = [
  /components\/messages-v5\/screens/,
  /components\/messages-v5\/shell/,
  /\.\.\/screens\//,
  /\.\.\/shell\//,
  /components\/admin\//,
  /server-actions\/messaging-engine/,
  /server-actions\/messaging-offers/,
  /server-actions\/messaging-money-actions/,
  /server-actions\/messaging-confirm/,
  /server-actions\/messaging-sheets/,
];

test("client bundle: no import from the staff screens, the staff shell, the admin shell or the staff actions", () => {
  assert.ok(clientFiles.length >= 4, `expected the client files, got ${clientFiles.length}`);
  for (const f of clientFiles) {
    const src = stripComments(readFileSync(join(HERE, f), "utf8"));
    const imports = src.match(/^\s*import[^;]*from\s+["'][^"']+["']/gm) ?? [];
    for (const line of imports) {
      for (const rule of FORBIDDEN_IMPORTS) assert.doesNotMatch(line, rule, `${f} imports a staff surface: ${line.trim()}`);
    }
    assert.doesNotMatch(src, /style=\{\{|style=["']/, `${f} has an inline style`);
    assert.doesNotMatch(src, /customer/i, `${f} says customer`);
  }
});

const STAFF_ONLY_FIELDS = [
  "talent_cost",
  "talentCost",
  "talent_cost_cents",
  "coordinator_fee",
  "coordinatorFee",
  "platform_fee",
  "platformFee",
  "net",
  "netCents",
  "commission",
  "payout",
  "discount_cents",
  "discountCents",
  "discount_label",
  "tax_cents",
  "taxCents",
  "tax_label",
  "proposed_by",
  "proposedBy",
  "confirmed_by",
  "price_snapshot_cents",
  "catalog_price_cents_at_add",
];

test("client payload readers and the client offer type never carry a staff-only money field", () => {
  const view = stripComments(read("lib/messages-v5/client-thread-view.ts"));
  const link = stripComments(read("lib/messaging/client-link.ts"));
  for (const field of STAFF_ONLY_FIELDS) {
    const re = new RegExp(`\\b${field}\\b`);
    assert.doesNotMatch(view, re, `client-thread-view.ts reads ${field}`);
    assert.doesNotMatch(link, re, `client-link.ts reads ${field}`);
  }
  // The offer select is an explicit, closed column list.
  const offerSelect = link.slice(link.indexOf('.from("inquiry_offers")'), link.indexOf(".eq(", link.indexOf('.from("inquiry_offers")')));
  assert.match(offerSelect, /\.select\("id, status, version, total_client_price, currency_code, valid_until, deposit_pct, deposit_amount_cents, refund_policy_key, notes, created_at"\)/);
  const lineSelect = link.slice(link.indexOf('.from("inquiry_offer_line_items")'), link.indexOf(".in(", link.indexOf('.from("inquiry_offer_line_items")')));
  assert.match(lineSelect, /\.select\("offer_id, label, units, total_price, sort_order"\)/);
});

test("token page renders the v5 client thread from the client reader; every client action verifies the token", () => {
  const page = read("app/(public)/c/t/[token]/page.tsx");
  assert.match(page, /verifyThreadToken\(/);
  assert.match(page, /customerVisibleMessages\(/);
  assert.match(page, /<ClientThread/);
  assert.doesNotMatch(page, /CustomerThread/);
  const actions = stripComments(read("lib/server-actions/messaging-client.ts"));
  assert.match(actions, /^"use server";/);
  assert.match(actions, /verifyThreadToken\(token\)/);
  assert.doesNotMatch(actions, /requireWorkspaceStaffAction|staff\(\)/, "client actions never take the staff guard");
  const exported = actions.match(/export async function (\w+)/g) ?? [];
  assert.ok(exported.length >= 6, `expected the six client actions, got ${exported.length}`);
  for (const fn of exported) {
    const body = actions.slice(actions.indexOf(fn));
    const head = body.slice(0, body.indexOf("\n}\n"));
    assert.match(head, /await link\(parsed\.data\.token\)/, `${fn} must verify the token before any read or write`);
  }
  // Every message the client writes is theirs: no staff sender id on the row.
  assert.doesNotMatch(actions, /senderUserId:\s*(?!\s*null)/, "a client action never writes a staff sender");
});
