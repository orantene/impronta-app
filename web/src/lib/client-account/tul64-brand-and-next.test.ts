/**
 * TUL-64 live-QA failures that do not need a signed-in session:
 *  1. a whitelabel agency's /login tab is titled with the agency name even when
 *     CLIENT_ACCOUNT_HOSTS does not list the host kind (prod: "Tulala" leaked);
 *  2. the signed-out bounce from the agency's own /client keeps the branded URL:
 *     /login?next=/client, never the doubled /impronta/client.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { authPageBrand, clientLoginNext } from "./agency-area-pure";

const on = { hostKind: "agency", whitelabel: true, publicName: " Impronta Models " };

test("login brand does not depend on the client-account flag", () => {
  assert.deepEqual(authPageBrand(on), { title: "Impronta Models" });
  assert.deepEqual(authPageBrand({ ...on, hostKind: "hub" }), { title: "Impronta Models" });
  assert.equal(authPageBrand({ ...on, whitelabel: false }), null);
  assert.equal(authPageBrand({ ...on, publicName: "  " }), null);
  for (const hostKind of ["app", "marketing", "talent_site", null]) assert.equal(authPageBrand({ ...on, hostKind }), null);
});

test("auth layout brands the title without reading the account flag", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(auth)/layout.tsx"), "utf8");
  assert.doesNotMatch(src, /clientAccountEnabledFor/);
});

test("client login next keeps the branded URL on the agency's own host", () => {
  assert.equal(clientLoginNext("agency", "impronta"), "/client");
  for (const h of ["app", "hub", "marketing", null, undefined]) assert.equal(clientLoginNext(h, "impronta"), "/impronta/client");
});

test("the workspace client layout uses clientLoginNext, not a hard-coded slug path", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/client/layout.tsx"), "utf8");
  assert.match(src, /clientLoginNext\(/);
  assert.doesNotMatch(src, /login\?next=\/\$\{tenantSlug\}\/client/);
});
