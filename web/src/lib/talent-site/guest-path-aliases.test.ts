import assert from "node:assert/strict";
import test from "node:test";

import { TALENT_GUEST_PATH_ALIASES, talentGuestAliasTarget } from "./guest-path-aliases";

test("GRK-028: Spanish guest paths map to booking / services / chat anchors", () => {
  assert.equal(TALENT_GUEST_PATH_ALIASES.agendar, "/#book");
  assert.equal(TALENT_GUEST_PATH_ALIASES.servicios, "/#services");
  assert.equal(TALENT_GUEST_PATH_ALIASES.contacto, "/#talent-ask");
});

test("talentGuestAliasTarget: host-root and /en prefix", () => {
  assert.equal(talentGuestAliasTarget("agendar"), "/#book");
  assert.equal(talentGuestAliasTarget("Agendar"), "/#book");
  assert.equal(talentGuestAliasTarget("servicios", { localePrefix: "en" }), "/en#services");
  assert.equal(talentGuestAliasTarget("contacto", { localePrefix: "/en/" }), "/en#talent-ask");
  assert.equal(talentGuestAliasTarget("nope"), null);
  assert.equal(talentGuestAliasTarget(null), null);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { talentGuestServiceAlias } from "./guest-path-aliases";

test("TUL-586: /servicios|services/<slug> redirect to the canonical service URL, locale kept", () => {
  assert.deepEqual(talentGuestServiceAlias("/servicios/servicio-x-3fa91c2b"), { kind: "redirect", path: "/servicio-x-3fa91c2b" });
  assert.deepEqual(talentGuestServiceAlias("/services/servicio-x-3fa91c2b", { localePrefix: "en" }), { kind: "redirect", path: "/en/servicio-x-3fa91c2b" });
  assert.deepEqual(talentGuestServiceAlias("/services/Servicio-X-3FA91C2B/", { localePrefix: "/en/" }), { kind: "redirect", path: "/en/servicio-x-3fa91c2b" });
});

test("TUL-586: bare /servicios and /services keep the home anchor; invalid slugs are a miss", () => {
  assert.equal(talentGuestServiceAlias("/servicios"), null);
  assert.equal(talentGuestServiceAlias("/services/"), null);
  assert.equal(talentGuestAliasTarget("services"), "/#services");
  assert.deepEqual(talentGuestServiceAlias("/servicios/not-a-slug"), { kind: "miss" });
  assert.deepEqual(talentGuestServiceAlias("/servicios/servicio-x-3fa91c2b/extra"), { kind: "miss" });
  assert.equal(talentGuestServiceAlias("/agendar/servicio-x-3fa91c2b"), null);
});

test("TUL-586 wiring: host response (308, query kept, miss skips home alias) and page.tsx mirror", () => {
  const host = readFileSync(join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"), "utf8");
  assert.match(host, /talentGuestServiceAlias\(localeStripped, \{ localePrefix \}\)/);
  assert.match(host, /target\.search = request\.nextUrl\.search;\s*const res = NextResponse\.redirect\(target, 308\)/);
  assert.match(host, /serviceAlias \? null : talentGuestAliasTarget/);
  const page = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");
  assert.match(page, /pageSlug\.length > 1/);
  assert.match(page, /permanentRedirect\(serviceAlias\.path\)/);
  assert.match(page, /originalLocalePrefix\(locale\)/);
});

test("TUL-586 GAP 3 pin: home service cards link via servicePageHrefs / serviceHrefs", () => {
  const render = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"), "utf8");
  assert.match(render, /servicePageHrefs\(visible, options\.dataSources\.talentServiceLinkBase\)/);
  assert.match(render, /serviceHrefs=\{serviceHrefs\}/);
  const filter = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/services-catalog-filter.tsx"), "utf8");
  assert.match(filter, /serviceHref=\{serviceHrefs\?\.\[item\.id\]\}/);
});
