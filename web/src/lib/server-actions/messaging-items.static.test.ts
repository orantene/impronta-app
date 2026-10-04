/**
 * Static contract: items catalog reader must authorize inquiry managers
 * (staff OR active coordinator), not workspace-staff alone — talent inbox
 * is not an admin surface.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "messaging-items.ts"),
  "utf8",
);

test("messagingLoadItemsCatalog gates via requireInquiryManagerAction", () => {
  assert.match(src, /requireInquiryManagerAction/);
  const catalogFn = src.slice(src.indexOf("export async function messagingLoadItemsCatalog"));
  const end = catalogFn.indexOf("export async function messagingLoadPersonSlots");
  const body = end >= 0 ? catalogFn.slice(0, end) : catalogFn;
  assert.match(body, /requireInquiryManagerAction\(inquiryId\)/);
  assert.match(body, /messagingStaff\(\)/); // staff fallback for admin Messages
  assert.match(body, /logServerError\("messagesV5\.itemsCatalog\/load"/);
  assert.doesNotMatch(
    body.replace(/messagingStaff\(\)/g, ""),
    /const g = await staff\(\)/,
  );
});
