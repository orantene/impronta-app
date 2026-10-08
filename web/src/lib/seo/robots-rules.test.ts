import test from "node:test";
import assert from "node:assert/strict";

import { buildRobots, AI_SEARCH_USER_AGENTS } from "./robots-rules";
import { publicRequestSiteBase } from "./site-origin";

const PLATFORM = new URL("https://tulala.digital");

function ruleFor(r: ReturnType<typeof buildRobots>, ua: string) {
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  return rules.find((x) => (Array.isArray(x.userAgent) ? x.userAgent.includes(ua) : x.userAgent === ua));
}

for (const kind of ["marketing", "agency", "talent_site"]) {
  test(`robots: ${kind} host is crawlable with the shared disallow list`, () => {
    const base = new URL("https://morena.tulala.digital");
    const r = buildRobots(kind, base);
    const star = ruleFor(r, "*");
    assert.equal(star?.allow, "/");
    assert.deepEqual(star?.disallow, ["/api/", "/admin/", "/preview/", "/_vercel/"]);
    assert.equal(r.sitemap, "https://morena.tulala.digital/sitemap.xml");
    assert.equal(r.host, "morena.tulala.digital");
  });
}

for (const kind of ["app", "hub", "unknown", "not_found"]) {
  test(`robots: ${kind} stays Disallow: /`, () => {
    const r = buildRobots(kind, PLATFORM);
    assert.deepEqual(r.rules, [{ userAgent: "*", disallow: "/" }]);
    assert.equal(r.sitemap, undefined);
  });
}

test("robots: AI search/user agents are explicitly allowed with the same rules as *", () => {
  const r = buildRobots("talent_site", new URL("https://morena.example.com"));
  for (const ua of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User", "Googlebot", "Bingbot"]) {
    const rule = ruleFor(r, ua);
    assert.ok(rule, `${ua} has a rule`);
    assert.equal(rule.allow, "/");
    assert.deepEqual(rule.disallow, ["/api/", "/admin/", "/preview/", "/_vercel/"]);
  }
});

test("robots: training crawlers are not given rules", () => {
  const listed = JSON.stringify(buildRobots("talent_site", PLATFORM).rules);
  for (const ua of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "anthropic-ai"]) {
    assert.ok(!listed.includes(ua), `${ua} must not appear`);
  }
  assert.equal(AI_SEARCH_USER_AGENTS.length, 7);
});

test("robots base: a talent_site host anchors Sitemap/Host to its own origin", () => {
  const base = publicRequestSiteBase({ kind: "talent_site", tenantId: null, hostname: "www.morena.com" });
  assert.equal(base.origin, "https://www.morena.com");
  const r = buildRobots("talent_site", base);
  assert.equal(r.sitemap, "https://www.morena.com/sitemap.xml");
});
