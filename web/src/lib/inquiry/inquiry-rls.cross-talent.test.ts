import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Cross-agency inbox loader was extracted from talent.ts into its own file
// (to keep talent.ts under the 800-line cap). Test reads the new file.
const TALENT_BRIDGE = readFileSync(
  join(
    process.cwd(),
    "src/app/(workspace)/[tenantSlug]/_data-bridge/talent-inquiries-all-agencies.ts",
  ),
  "utf8",
);

test("unified talent inbox loader keys on talent_profile_id not user_id", () => {
  assert.match(TALENT_BRIDGE, /loadTalentInquiriesAllAgencies/);
  const fnStart = TALENT_BRIDGE.indexOf("export async function loadTalentInquiriesAllAgencies");
  assert.ok(fnStart >= 0);
  const querySection = TALENT_BRIDGE.slice(fnStart, fnStart + 1200);
  assert.match(querySection, /\.eq\("talent_profile_id", talentProfileId\)/);
  assert.doesNotMatch(querySection, /\.eq\("user_id"/);
});

test("unified talent inbox does not gate on a single tenant_id", () => {
  const fnStart = TALENT_BRIDGE.indexOf("export async function loadTalentInquiriesAllAgencies");
  assert.ok(fnStart >= 0);
  const fnBody = TALENT_BRIDGE.slice(fnStart, fnStart + 4500);
  assert.doesNotMatch(fnBody, /\.eq\("inquiries\.tenant_id"/);
});

test("commission snapshot migration grants talent self-read via booking_talent join", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "../supabase/migrations/20260525192000_talent_select_own_commission_snapshot.sql",
    ),
    "utf8",
  );
  assert.match(migration, /booking_talent/);
  assert.match(migration, /talent_profiles/);
  assert.match(migration, /auth\.uid\(\)/);
});
