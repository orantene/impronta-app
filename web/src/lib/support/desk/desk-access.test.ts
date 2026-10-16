import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideDeskAccess,
  deskForbiddenLocale,
  shouldAttemptDeskAuthRescope,
} from "./desk-access";

test("forbidden page uses the saved language unless the visitor picked one (TUL-51)", () => {
  assert.equal(deskForbiddenLocale({ cookieLocale: null, savedLocale: "es", requestLocale: "en" }), "es");
  assert.equal(deskForbiddenLocale({ cookieLocale: "en", savedLocale: "es", requestLocale: "en" }), "en");
  assert.equal(deskForbiddenLocale({ cookieLocale: undefined, savedLocale: null, requestLocale: "en" }), "en");
  assert.equal(deskForbiddenLocale({ cookieLocale: null, savedLocale: "fr", requestLocale: "es" }), "es");
});

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
