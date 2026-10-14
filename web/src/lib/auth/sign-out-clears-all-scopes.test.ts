import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { GET } from "@/app/auth/sign-out/route";

/**
 * S1: the `signOut` server action writes cookies through a name-keyed jar, so
 * only ONE scope per cookie name is expired. A legacy host-only auth cookie
 * shadowing the `.tulala.digital` one survived and the user stayed signed in.
 * The action must therefore finish through /auth/sign-out, which expires both
 * scopes with raw Set-Cookie headers.
 */
const cookie = "sb-abc-auth-token.0=a; sb-abc-auth-token.1=b; other=1";

function get(headers: Record<string, string>) {
  return GET(
    new Request("https://app.tulala.digital/auth/sign-out", {
      headers: { cookie, host: "app.tulala.digital", ...headers },
    }),
  );
}

test("signOut server action finishes through the both-scope clearing route", () => {
  const src = readFileSync(join(process.cwd(), "src/app/auth/actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function signOut()"));
  const fn = body.slice(0, body.indexOf("\n}\n"));
  assert.match(fn, /redirect\("\/auth\/sign-out"\)/);
  assert.doesNotMatch(fn, /redirect\("\/"\)/);
});

test("GET /auth/sign-out expires host-only AND parent-domain auth cookies", async () => {
  const res = await get({ "sec-fetch-site": "same-origin" });
  const set = res.headers.getSetCookie();
  for (const n of ["sb-abc-auth-token.0", "sb-abc-auth-token.1"]) {
    assert.ok(set.includes(`${n}=; Path=/; Max-Age=0`), `${n} host-only`);
    assert.ok(set.includes(`${n}=; Path=/; Max-Age=0; Domain=.tulala.digital`), `${n} parent`);
  }
  assert.ok(!set.some((h) => h.startsWith("other=")));
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("a cross-site GET cannot sign the user out", async () => {
  const res = await get({ "sec-fetch-site": "cross-site" });
  assert.equal(res.headers.getSetCookie().length, 0);
});
