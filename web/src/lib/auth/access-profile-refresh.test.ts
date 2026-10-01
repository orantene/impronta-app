import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCESS_PROFILE_REFRESH_VALUE,
  wantsAccessProfileRefresh,
} from "./access-profile-refresh";

test("only the one-shot value busts the access-profile memo", () => {
  assert.equal(wantsAccessProfileRefresh(ACCESS_PROFILE_REFRESH_VALUE), true);
  assert.equal(wantsAccessProfileRefresh(undefined), false);
  assert.equal(wantsAccessProfileRefresh(""), false);
  assert.equal(wantsAccessProfileRefresh("0"), false);
});

import {
  ACCESS_PROFILE_REFRESH_COOKIE,
  accessProfileRefreshStamp,
  buildAccessProfileRefreshCookie,
  isAccessProfileMemoUsable,
} from "./access-profile-refresh";

test("refresh cookie is scoped to the shared parent domain on production hosts", () => {
  for (const host of ["tulala.digital", "app.tulala.digital", "tulala.digital:443"]) {
    const c = buildAccessProfileRefreshCookie(host, 1_790_000_000_000);
    assert.equal(c.name, ACCESS_PROFILE_REFRESH_COOKIE);
    assert.equal(c.options.domain, ".tulala.digital");
    assert.equal(c.options.secure, true);
    assert.equal(c.value, "1790000000000");
    assert.equal(c.options.path, "/");
    assert.equal(c.options.httpOnly, true);
  }
});

test("refresh cookie stays host-only on localhost and custom domains", () => {
  for (const host of ["localhost:3001", "127.0.0.1:3001", "improntamodels.com", null]) {
    const c = buildAccessProfileRefreshCookie(host, 1_790_000_000_000);
    assert.equal(c.options.domain, undefined, String(host));
    assert.equal("domain" in c.options, false);
  }
  assert.equal(buildAccessProfileRefreshCookie("localhost:3001").options.secure, false);
});

test("a stamp invalidates memo entries recorded before it, on any instance", () => {
  const ttl = 60_000;
  const stamp = 1_790_000_000_000;
  const v = String(stamp);
  assert.equal(accessProfileRefreshStamp(v), stamp);
  assert.equal(accessProfileRefreshStamp("1"), null);
  assert.equal(accessProfileRefreshStamp("abc"), null);
  assert.equal(wantsAccessProfileRefresh(v), true);
  // pre-onboarding entry, still inside the TTL: stale because of the stamp
  assert.equal(isAccessProfileMemoUsable(stamp - 5_000, stamp + 1_000, ttl, v), false);
  // entry re-read after the build: usable
  assert.equal(isAccessProfileMemoUsable(stamp + 500, stamp + 1_000, ttl, v), true);
  // no cookie: plain TTL
  assert.equal(isAccessProfileMemoUsable(stamp, stamp + 1_000, ttl, null), true);
  assert.equal(isAccessProfileMemoUsable(stamp, stamp + ttl, ttl, null), false);
  // legacy one-shot: always bypass
  assert.equal(isAccessProfileMemoUsable(stamp, stamp + 1, ttl, ACCESS_PROFILE_REFRESH_VALUE), false);
});
