import assert from "node:assert/strict";
import { test } from "node:test";

import { WORKSPACE_POST_BASE, WORKSPACE_POST_PROBES, absoluteAppWorkspaceLinks, decideNavCheck, decideProbe, headerNavHrefs, siteHostResolves, talentHostPlan } from "./staging-nav-host-checks.mjs";

const GOOD = '<header><a href="/about">About</a><nav><a href="/w/acme/contact">Contact</a></nav></header><main><a href="https://app.staging.tulala.digital/w/x/y">body link</a></main>';
const BAD = '<header><nav><a href="https://app.staging.tulala.digital/w/acme/catalogue">Catalogue</a><a href="/home">Home</a></nav></header>';

test("collects header and nav hrefs only (body links are ignored)", () => {
  assert.deepEqual(headerNavHrefs(GOOD).sort(), ["/about", "/w/acme/contact"]);
});

test("flags absolute app-host /w/ links in the header/nav, on both app hosts", () => {
  assert.equal(absoluteAppWorkspaceLinks(BAD).length, 1);
  assert.equal(absoluteAppWorkspaceLinks('<nav><a href="https://app.tulala.digital/w/a/b">x</a></nav>').length, 1);
  assert.equal(absoluteAppWorkspaceLinks('<nav><a href="https://staging.tulala.digital/w/a">x</a></nav>').length, 0);
  assert.equal(absoluteAppWorkspaceLinks(GOOD).length, 0);
});

test("nav verdict: needs 200, no bad links, and some links to inspect", () => {
  assert.equal(decideNavCheck(200, GOOD).ok, true);
  assert.equal(decideNavCheck(200, BAD).ok, false);
  assert.equal(decideNavCheck(404, GOOD).ok, false);
  assert.equal(decideNavCheck(200, "<main>no header</main>").ok, false);
});

test("talent host skips unless TALENT_SITE_SUBDOMAINS_ENABLED is exactly \"true\"", () => {
  for (const env of [{}, { TALENT_SITE_SUBDOMAINS_ENABLED: "" }, { TALENT_SITE_SUBDOMAINS_ENABLED: "1" }, { TALENT_SITE_SUBDOMAINS_ENABLED: "TRUE" }, { TALENT_SITE_SUBDOMAINS_ENABLED: "false" }, { TALENT_SITE_ROOT_DOMAIN: "x.digital" }]) {
    const p = talentHostPlan(env);
    assert.equal(p.skip, true);
    assert.match(p.reason, /TALENT_SITE_SUBDOMAINS_ENABLED not set/);
  }
});

test("talent host plan targets the T1 fixture host on the staging wildcard and the post states", () => {
  const p = talentHostPlan({ TALENT_SITE_SUBDOMAINS_ENABLED: "true" });
  assert.equal(p.skip, false);
  assert.equal(p.host, "qa-fixture-g6-limpieza.staging.tulala.digital");
  assert.deepEqual(p.probes.map((x) => x.path), ["/"]);
  const byPath = Object.fromEntries(WORKSPACE_POST_PROBES.map((x) => [x.path, x.expect]));
  assert.equal(WORKSPACE_POST_BASE, "https://staging.tulala.digital/w/qa-fixture-g6-ws");
  assert.deepEqual(byPath["/blog/qa-fixture-g6-guia-limpieza"], [200]);
  assert.deepEqual(byPath["/blog/qa-fixture-g6-oferta-vencida"], [200]);
  assert.deepEqual(byPath["/blog/qa-fixture-g6-articulo-oculto"], [404]);
  assert.deepEqual(byPath["/blog/qa-fixture-g6-no-such-post"], [404]);
  assert.equal(decideProbe(p.probes[0], 200).ok, true);
  assert.equal(decideProbe(p.probes[0], 404).ok, false);
});

test("the site host only counts as resolving on a 200 home", () => {
  assert.equal(siteHostResolves(200), true);
  for (const st of [0, 301, 404, 500]) assert.equal(siteHostResolves(st), false);
});
