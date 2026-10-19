import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-664: the live-site pill on Today named the same state two ways by plan
 * ("Administrar sitio" on Max, "Sitio en vivo" on Free). One label per state;
 * the plan only changes what the tap does, never the name.
 */
const src = readFileSync(
  join(process.cwd(), "src/components/talent/website-reward/WebsiteRewardControl.tsx"),
  "utf8",
);
const i18n = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/dashboard-i18n-website.ts"),
  "utf8",
);

test("live pill label does not branch on plan tier", () => {
  assert.doesNotMatch(src, /onWebOffice\s*\?\s*copy\.t\("Manage website"\)/);
  assert.doesNotMatch(src, /Manage website/);
});

test("live pill uses one translated key for both title and aria-label", () => {
  const uses = src.match(/copy\.t\("Website live"\)/g) ?? [];
  assert.ok(uses.length >= 2, "title and aria-label both use the shared key");
});

test("ES and EN strings exist for the shared label", () => {
  assert.match(i18n, /"Website live": "Sitio en vivo"/);
});

test("TUL-818: the personal live pill reads the verified state, not the published flag alone", () => {
  // TUL-1274: same verified reader, read through the GET helper (not a server action on mount).
  assert.match(src, /readTalentDashboard\("site-live-verified"\)/);
  assert.match(src, /liveBadgeState\(\{ published: true, verified: liveVerified \}\)/);
  assert.match(src, /badge === "live" \? copy\.t\("Website live"\)/);
  assert.match(i18n, /"Checking your website": "Comprobando tu sitio"/);
});
