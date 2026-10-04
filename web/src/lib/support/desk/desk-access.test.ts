import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideDeskAccess,
  shouldAttemptDeskAuthRescope,
} from "./desk-access";

test("flag off always hides the surface", () => {
  assert.deepEqual(
    decideDeskAccess({
      flagEnabled: false,
      hasUser: true,
      isPlatformAdmin: true,
    }),
    { allow: false, reason: "flag_off" },
  );
});

test("unauthenticated redirects to login (not soft 404)", () => {
  assert.deepEqual(
    decideDeskAccess({
      flagEnabled: true,
      hasUser: false,
      isPlatformAdmin: false,
    }),
    { allow: false, reason: "unauthenticated" },
  );
});

test("authenticated non-admin is forbidden (not soft 404)", () => {
  assert.deepEqual(
    decideDeskAccess({
      flagEnabled: true,
      hasUser: true,
      isPlatformAdmin: false,
    }),
    { allow: false, reason: "forbidden" },
  );
});

test("platform admin is allowed when flag is on", () => {
  assert.deepEqual(
    decideDeskAccess({
      flagEnabled: true,
      hasUser: true,
      isPlatformAdmin: true,
    }),
    { allow: true },
  );
});

test("desk auth rescope only for non-admin sessions on /desk once", () => {
  assert.equal(
    shouldAttemptDeskAuthRescope({
      isSupportDeskHost: true,
      pathname: "/desk",
      hasUser: true,
      isPlatformAdmin: false,
      alreadyRescoped: false,
    }),
    true,
  );
  assert.equal(
    shouldAttemptDeskAuthRescope({
      isSupportDeskHost: true,
      pathname: "/desk",
      hasUser: true,
      isPlatformAdmin: false,
      alreadyRescoped: true,
    }),
    false,
  );
  assert.equal(
    shouldAttemptDeskAuthRescope({
      isSupportDeskHost: true,
      pathname: "/desk",
      hasUser: true,
      isPlatformAdmin: true,
      alreadyRescoped: false,
    }),
    false,
  );
  assert.equal(
    shouldAttemptDeskAuthRescope({
      isSupportDeskHost: false,
      pathname: "/desk",
      hasUser: true,
      isPlatformAdmin: false,
      alreadyRescoped: false,
    }),
    false,
  );
});
