import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const APP = join(__dirname, "../../app/account");
const ROUTES = ["page.tsx", "visits/[id]/page.tsx", "messages/[thread]/page.tsx", "receipts/[code]/page.tsx"];

test("every client account route exports force-dynamic (never CDN-cached across visitors)", () => {
  for (const r of ROUTES) {
    const src = readFileSync(join(APP, r), "utf8");
    assert.match(src, /export const dynamic = "force-dynamic"/, r);
  }
});

test("reschedule passes the signed-in user as the audit actor", () => {
  const src = readFileSync(join(__dirname, "booking-actions.ts"), "utf8");
  assert.match(src, /actorUserId: g\.userId/);
  assert.match(src, /userId: session\.user\.id/);
  assert.doesNotMatch(src, /actorUserId: ""/);
});
