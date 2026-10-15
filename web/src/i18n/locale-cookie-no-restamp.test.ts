/**
 * TUL-866: /es/... must not re-stamp the locale cookies when the visitor
 * already holds a chosen `locale=es`. Set-Cookie on every Spanish page view
 * made them uncacheable (2.3s vs 0.5s for English).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";

import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";
import { LOCALE_COOKIE, syncLocaleCookieForPath } from "@/i18n/locale-middleware";

function run(cookie: string | null) {
  const request = new NextRequest("https://tulala.digital/es/funciones/citas-y-reservas", {
    headers: cookie ? { cookie } : {},
  });
  const res = NextResponse.next();
  syncLocaleCookieForPath(res, "/es/funciones/citas-y-reservas", undefined, request);
  return res.headers.getSetCookie();
}

test("chosen es cookie: no Set-Cookie", () => {
  assert.deepEqual(run(`${LOCALE_COOKIE}=es`), []);
});

test("no cookie: stamps locale", () => {
  assert.ok(run(null).some((c) => c.startsWith(`${LOCALE_COOKIE}=es`)));
});

test("auto-written es cookie: still stamps (clears the auto marker)", () => {
  const out = run(`${LOCALE_COOKIE}=es; ${LOCALE_AUTO_COOKIE}=1`);
  assert.ok(out.some((c) => c.startsWith(`${LOCALE_AUTO_COOKIE}=;`)));
});

test("different cookie value: stamps", () => {
  assert.ok(run(`${LOCALE_COOKIE}=en`).some((c) => c.startsWith(`${LOCALE_COOKIE}=es`)));
});
