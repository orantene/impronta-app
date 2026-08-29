import assert from "node:assert/strict";
import { test } from "node:test";
import { nextUrlAfterSupportDeepLink, parseSupportDeepLink } from "./support-deep-link";

test("parseSupportDeepLink reads support and strips it from the query", () => {
  const parsed = parseSupportDeepLink("?support=11111111-1111-1111-1111-111111111111&foo=1");
  assert.equal(parsed.ticketId, "11111111-1111-1111-1111-111111111111");
  assert.equal(parsed.nextQuery, "?foo=1");
});

test("parseSupportDeepLink with only support leaves an empty query", () => {
  const parsed = parseSupportDeepLink("?support=abc");
  assert.equal(parsed.ticketId, "abc");
  assert.equal(parsed.nextQuery, "");
});

test("parseSupportDeepLink without the param is a no-op", () => {
  const parsed = parseSupportDeepLink("?view=thread");
  assert.equal(parsed.ticketId, null);
  assert.equal(parsed.nextQuery, "?view=thread");
});

test("nextUrlAfterSupportDeepLink matches history.replaceState cleanup", () => {
  const next = nextUrlAfterSupportDeepLink(
    "/admin",
    "?support=tid&x=1",
    "#top",
  );
  assert.equal(next, "/admin?x=1#top");
  assert.equal(nextUrlAfterSupportDeepLink("/admin", "", ""), null);
});
