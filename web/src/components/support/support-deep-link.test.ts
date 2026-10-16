import assert from "node:assert/strict";
import { test } from "node:test";
import { nextUrlAfterSupportDeepLink, parseSupportDeepLink } from "./support-deep-link";

test("parseSupportDeepLink reads support and strips it from the query", () => {
  const parsed = parseSupportDeepLink("?support=11111111-1111-1111-1111-111111111111&foo=1");
  assert.equal(parsed.ticketId, "11111111-1111-1111-1111-111111111111");
  assert.equal(parsed.nextQuery, "?foo=1");
});

test("parseSupportDeepLink with only support leaves an empty query", () => {
  const parsed = parseSupportDeepLink("?support=11111111-1111-1111-1111-111111111111");
  assert.equal(parsed.ticketId, "11111111-1111-1111-1111-111111111111");
  assert.equal(parsed.nextQuery, "");
  assert.equal(parsed.invalid, false);
});

test("parseSupportDeepLink without the param is a no-op", () => {
  const parsed = parseSupportDeepLink("?view=thread");
  assert.equal(parsed.ticketId, null);
  assert.equal(parsed.nextQuery, "?view=thread");
});

test("nextUrlAfterSupportDeepLink matches history.replaceState cleanup", () => {
  const next = nextUrlAfterSupportDeepLink(
    "/admin",
    "?support=11111111-1111-1111-1111-111111111111&x=1",
    "#top",
  );
  assert.equal(next, "/admin?x=1#top");
  assert.equal(nextUrlAfterSupportDeepLink("/admin", "", ""), null);
});

test("TUL-677: a non-uuid support value opens the panel Home, not a thread that cannot load", () => {
  for (const bad of ["abc", "<id>", "8", "11111111-1111-1111-1111-11111111111"]) {
    const parsed = parseSupportDeepLink(`?support=${encodeURIComponent(bad)}&x=1`);
    assert.equal(parsed.ticketId, null, bad);
    assert.equal(parsed.invalid, true, bad);
    assert.equal(parsed.nextQuery, "?x=1", bad);
  }
  assert.equal(nextUrlAfterSupportDeepLink("/talent", "?support=abc", ""), "/talent");
  assert.equal(parseSupportDeepLink("?x=1").invalid, false);
});
