import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("the loader runs as the talent (RLS) and a failed read is not an empty page", () => {
  const src = read("lib/talent/service-hub-channels.server.ts");
  assert.match(src, /\.eq\("talent_profile_id", talentProfileId\)/);
  assert.equal((src.match(/\.eq\("talent_profile_id", talentProfileId\)/g) ?? []).length, 5);
  assert.doesNotMatch(src, /createServiceRoleClient/);
  assert.match(src, /return \{ ok: false \}/);
});

test("the lowest-price action is a guarded server action that calls the database function, not a table write", () => {
  const src = read("lib/server-actions/service-hub-lowest.ts");
  assert.match(src, /^"use server";/);
  assert.match(src, /await requireNotImpersonating\(\)/);
  assert.match(src, /rpc\("set_workspace_service_listing_lowest"/);
  assert.doesNotMatch(src, /\.update\(/);
  assert.match(src, /not_ready/);
});

test("held migration 420000: function only, own talent only, no direct grants on the table", () => {
  const sql = readFileSync(join(root, "../../supabase/migrations/_pending_pm/20261231420000_set_listing_lowest_tul1371.sql"), "utf8");
  const body = sql.replace(/--.*$/gm, "");
  assert.match(body, /is_own_talent_profile\(v_l\.talent_profile_id\)/);
  assert.match(body, /REVOKE ALL ON FUNCTION public\.set_workspace_service_listing_lowest\(uuid, bigint\) FROM PUBLIC, anon/);
  assert.match(body, /GRANT EXECUTE ON FUNCTION public\.set_workspace_service_listing_lowest\(uuid, bigint\) TO authenticated/);
  assert.doesNotMatch(body, /CREATE POLICY|DROP TABLE|DELETE FROM|INSERT INTO/i);
  assert.match(sql, /-- Rollback:[\s\S]*DROP FUNCTION IF EXISTS public\.set_workspace_service_listing_lowest/);
  assert.match(sql, /20261231419300/);
});

test("the page is a standalone canonical route that needs a signed in talent", () => {
  const page = read("app/(workspace)/talent/where-you-appear/page.tsx");
  assert.match(page, /if \(!session\.user\) notFound\(\)/);
  assert.match(page, /loadServiceHubChannels\(supabase, talentProfileId, session\.user\.id\)/);
  assert.match(page, /<CalendarByChannelPanel result=\{data\.calendar\}/);
});

test("the Money page links to the channels page, in the dashboard language", () => {
  const src = read("components/talent/money/MoneyAgencyCards.tsx");
  assert.match(src, /href="\/talent\/where-you-appear"/);
  assert.match(src, /channelCopy\(useDashboardLocale\(\)\)/);
});

test("the calendar read fails as a whole, never as an empty calendar", () => {
  const src = read("lib/talent/service-hub-channels.server.ts");
  assert.match(src, /holdsRes\.error \?\? bookingsRes\.error \?\? ownRes\.error/);
  assert.match(src, /serviceHub\.channels\.calendarTenants/);
});
