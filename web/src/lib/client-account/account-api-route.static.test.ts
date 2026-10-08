import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(join(__dirname, "../../app/api/client/account/route.ts"), "utf8");
const code = src.replace(/\/\/.*$/gm, "");

test("route is force-dynamic", () => {
  assert.match(code, /export const dynamic = "force-dynamic"/);
});

test("the query string feeds nothing but the whitelisted locale", () => {
  const uses = code.match(/searchParams|req\.url|request\.url/g) ?? [];
  assert.equal(uses.length, 2, "only the locale line may touch the URL");
  assert.match(code, /searchParams\.get\("locale"\) === "es" \? "es" : "en"/);
  assert.doesNotMatch(code, /searchParams\.get\("(?!locale)/);
});

test("user comes from the session and tenant from the host, never from the request", () => {
  assert.match(code, /const user = session\.user/);
  assert.match(code, /resolveAccountTenant\(\)/);
  assert.match(code, /userId: user\.id, tenantId: tenant\.tenantId/);
  assert.doesNotMatch(code, /headers\(|req\.headers|\.cookies/);
});

test("non-clients get the business marker and no client data", () => {
  assert.match(code, /signedIn: false, signedInAs: "business"/);
  const idx = code.indexOf('signedInAs: "business"');
  assert.ok(idx < code.indexOf("loadClientAccountSummary("));
});

test("every response goes through the no-store helper", () => {
  assert.match(code, /"Cache-Control": "private, no-store"/);
  assert.match(code, /NextResponse\.json\(body, \{ status, headers: NO_STORE \}\)/);
  assert.equal((code.match(/NextResponse\.json\(/g) ?? []).length, 1, "no bare NextResponse.json outside reply()");
  assert.doesNotMatch(code, /new (Next)?Response\(/);
  for (const m of code.matchAll(/return\s+(?!await respond)(\w+)\(/g)) assert.equal(m[1], "reply");
});
