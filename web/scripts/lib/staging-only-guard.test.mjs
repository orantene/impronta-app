import assert from "node:assert/strict";
import test from "node:test";
import { checkStagingOnly, everyDayWeekly, STAGING_SUPABASE_HOST } from "./staging-only-guard.mjs";

const url = (u) => ({ NEXT_PUBLIC_SUPABASE_URL: u });

test("accepts only the exact staging host", () => {
  assert.equal(checkStagingOnly(url(`https://${STAGING_SUPABASE_HOST}`)).ok, true);
  assert.equal(checkStagingOnly(url(`https://${STAGING_SUPABASE_HOST}/`)).ok, true);
});
test("refuses production, lookalikes, missing and garbage", () => {
  for (const u of [
    "https://pluhdapdnuiulvxmyspd.supabase.co",
    `https://${STAGING_SUPABASE_HOST}.evil.com`,
    `https://x.${STAGING_SUPABASE_HOST}`,
    `https://evil.com/${STAGING_SUPABASE_HOST}`,
    "http://127.0.0.1:54321",
    "",
    "not a url",
  ]) {
    assert.equal(checkStagingOnly(url(u)).ok, false, u);
  }
  assert.equal(checkStagingOnly({}).ok, false);
});
test("everyDayWeekly opens all seven days", () => {
  const w = everyDayWeekly();
  assert.equal(Object.keys(w).length, 7);
  assert.deepEqual(w[3], [{ startMin: 540, endMin: 1080 }]);
});
