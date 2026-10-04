/**
 * Revert-proof: talent-site cold load passes `?order=` into the dock mount.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const WEB = process.cwd();

test("talent site page forwards searchParams.order to the dock", () => {
  const src = readFileSync(join(WEB, "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");
  assert.match(src, /order\?: string/);
  assert.match(src, /orderId=\{order \?\? null\}/);
});

test("TalentSiteMessagesDock forwards orderId to the launcher mount", () => {
  const src = readFileSync(join(WEB, "src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx"), "utf8");
  assert.match(src, /orderId\?: string \| null/);
  assert.match(src, /orderId=\{orderId\}/);
});

test("TalentProfileChatLauncherMount prefers getGuestInquiryByOrder and forceOpen", () => {
  const src = readFileSync(join(WEB, "src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx"), "utf8");
  assert.match(src, /getGuestInquiryByOrder/);
  assert.match(src, /parseGuestOrderQuery/);
  assert.match(src, /forceOpen=\{forceOpen\}/);
});

test("session restore opens on forceOpen for cold ?order=", () => {
  const src = readFileSync(join(WEB, "src/app/t/[profileCode]/_chat/use-launcher-session-restore.ts"), "utf8");
  assert.match(src, /forceOpen/);
  assert.match(src, /if \(forceOpen\)/);
});
