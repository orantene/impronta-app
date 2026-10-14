import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { EXPORT_FRESH_MINUTES, isSessionFreshForExport } from "./export-guard";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const read = (p: string) => blankComments(readFileSync(join(process.cwd(), p), "utf8"));

test("a sign-in inside the window is fresh, an old one is not", () => {
  assert.equal(isSessionFreshForExport(ago(1), NOW), true);
  assert.equal(isSessionFreshForExport(ago(EXPORT_FRESH_MINUTES + 1), NOW), false);
});

test("missing, unparseable or future sign-in times are never fresh", () => {
  assert.equal(isSessionFreshForExport(null, NOW), false);
  assert.equal(isSessionFreshForExport(undefined, NOW), false);
  assert.equal(isSessionFreshForExport("not a date", NOW), false);
  assert.equal(isSessionFreshForExport(ago(-30), NOW), false);
});

test("export route refuses impersonation, stale sessions and bursts, in that order after auth", () => {
  const src = read("src/app/api/account/export/route.ts");
  const i = (s: string) => src.indexOf(s);
  assert.ok(i("assertNotImpersonating") > 0, "impersonation guard");
  assert.ok(i("isSessionFreshForExport") > 0, "freshness check");
  assert.ok(i("checkAccountExport") > 0, "rate limit");
  assert.ok(i("reauth_required") > 0, "reauth error code");
  assert.ok(i("unauthenticated") < i("assertNotImpersonating"));
  assert.ok(i("assertNotImpersonating") < i("isSessionFreshForExport"));
  assert.ok(i("isSessionFreshForExport") < i("buildAccountExport("), "guards run before the bundle is built");
  assert.ok(i("checkAccountExport") < i("buildAccountExport("));
});

test("UI has a confirm step and no one-click download links", () => {
  const src = read("src/components/account/AccountExportLinks.tsx");
  assert.ok(!/<a[^>]*download/.test(src), "no bare download anchor");
  assert.ok(src.includes("confirmTitle") && src.includes("setConfirm"), "confirm step");
  assert.ok(src.includes("reauth_required") && src.includes("/login?next="), "sign in again path");
});

test("talent settings no longer navigates straight to the export route", () => {
  const src = read("src/components/admin/shell/internal/talent/pages/SettingsPage.tsx");
  assert.ok(!src.includes('window.location.assign("/api/account/export")'));
});
