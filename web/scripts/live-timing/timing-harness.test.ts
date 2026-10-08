import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  TEST_TALENT_CODE,
  TIMED_PAGES,
  assertTestTalent,
  buildSessionCookies,
  deleteTempState,
  formatTable,
  isHydrationError,
  mintTestTalentState,
  summarize,
  writeTempState,
  type LoadSample,
  type MintPorts,
} from "./timing-harness";

const session = { access_token: "a".repeat(40), token_type: "bearer", expires_in: 3600, expires_at: 1, refresh_token: "r".repeat(12), user: { id: "u1" } };
const ports = (calls: string[] = []): MintPorts => ({
  async emailForProfileCode(code) { calls.push(`email:${code}`); return "test-talent@example.test"; },
  async hashedTokenFor(email) { calls.push(`link:${email}`); return "hash"; },
  async verifyOtp(h) { calls.push(`otp:${h}`); return session; },
});

test("only the test talent can be minted; Jorgelina and any other code are refused before any call", async () => {
  for (const bad of ["TAL-93938", "tal-93938", "TAL-93020", "", "TAL-93900 OR 1=1"]) {
    const calls: string[] = [];
    await assert.rejects(() => mintTestTalentState(ports(calls), { code: bad }), /REFUSED/);
    assert.deepEqual(calls, [], `no call made for ${bad}`);
  }
  assert.doesNotThrow(() => assertTestTalent(TEST_TALENT_CODE));
  assert.doesNotThrow(() => assertTestTalent(" tal-93900 "));
});

test("only the production Supabase ref is a valid target", async () => {
  await assert.rejects(() => mintTestTalentState(ports(), { ref: "someotherprojectref" }), /REFUSED/);
});

test("the mint resolves the email by profile code, then link, then otp, in that order", async () => {
  const calls: string[] = [];
  const state = await mintTestTalentState(ports(calls));
  assert.deepEqual(calls, ["email:TAL-93900", "link:test-talent@example.test", "otp:hash"]);
  assert.equal(state.cookies[0]!.name, "sb-pluhdapdnuiulvxmyspd-auth-token");
  assert.equal(state.cookies[0]!.domain, "app.tulala.digital");
  assert.ok(state.cookies[0]!.value.startsWith("base64-"));
  assert.deepEqual(state.origins, []);
});

test("a missing auth user stops the run", async () => {
  await assert.rejects(() => mintTestTalentState({ ...ports(), async emailForProfileCode() { return null; } }), /no auth user/);
});

test("a long session is chunked like @supabase/ssr and reassembles to the same JSON", () => {
  const big = { ...session, user: { id: "u", blob: "x".repeat(9000) } };
  const cookies = buildSessionCookies(big, "app.tulala.digital", "ref");
  assert.ok(cookies.length >= 3);
  assert.deepEqual(cookies.map((c) => c.name), cookies.map((_, i) => `sb-ref-auth-token.${i}`));
  const joined = cookies.map((c) => c.value).join("");
  const back = JSON.parse(Buffer.from(joined.replace(/^base64-/, ""), "base64").toString("utf8"));
  assert.equal(back.user.blob.length, 9000);
});

test("the temp storage state is private and is deleted, twice-safe", () => {
  const file = writeTempState({ cookies: [], origins: [] });
  assert.ok(existsSync(file) && file.includes("tulala-timing-"));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).cookies.length, 0);
  assert.equal(deleteTempState(file), true);
  assert.equal(existsSync(file), false);
  assert.equal(deleteTempState(file), true); // second call is harmless
  assert.equal(deleteTempState("/etc/passwd"), false); // only our own temp dirs
  assert.equal(deleteTempState(null), false);
});

test("hydration errors are recognised (#418 and friends), ordinary errors are not", () => {
  assert.equal(isHydrationError("Error: Minified React error #418; visit https://react.dev/errors/418"), true);
  assert.equal(isHydrationError("Hydration failed because the server rendered HTML didn't match the client"), true);
  assert.equal(isHydrationError("Minified React error #423"), true);
  assert.equal(isHydrationError("Failed to load resource: 404"), false);
  assert.equal(isHydrationError("Minified React error #4180"), false);
});

const sample = (page: LoadSample["page"], load: number, ms: number | null, errs: string[] = [], vis = "visible"): LoadSample => ({ page, load, ttfbMs: 300, domContentLoadedMs: 900, firstContentMs: ms, visibility: vis, hydrationErrors: errs });

test("summary: min/median/max, never-rendered, #418 and hidden counts per page, all four pages always present", () => {
  const sum = summarize([
    sample("today", 1, 5000, ["#418"]), sample("today", 2, 9000), sample("today", 3, null),
    sample("messages", 1, 3000), sample("messages", 2, 4000, [], "hidden"), sample("messages", 3, 5000),
  ]);
  assert.deepEqual(sum.map((s) => s.page), TIMED_PAGES.map((p) => p.key));
  const today = sum[0]!;
  assert.deepEqual(today.contentMs, { min: 5000, median: 7000, max: 9000 });
  assert.equal(today.neverRendered, 1);
  assert.equal(today.hydrationErrors, 1);
  assert.equal(sum[1]!.notVisible, 1);
  assert.equal(sum[2]!.loads, 0);
});

test("the table prints timings and counts only (no tokens), one row per page", () => {
  const out = formatTable(summarize([sample("today", 1, 5000), sample("today", 2, null)]));
  assert.equal(out.split("\n").length, 1 + TIMED_PAGES.length);
  assert.match(out, /today\s+2\s+5\.0s \/ 5\.0s \/ 5\.0s\s+1/);
  assert.match(out, /never/);
  assert.ok(!/eyJ|base64-|access_token/.test(out));
});
