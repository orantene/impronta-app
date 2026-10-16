import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRobots, isIndexableHostKind, isNonProductionDeploy } from "./robots-rules";

const base = new URL("https://example.tulala.digital");
const DISALLOW_ALL = [{ userAgent: "*", disallow: "/" }];

// TUL-1146: robots.txt per environment (guard for the Infra g7 robots work).
test("production: indexable host kinds are open, with a sitemap and the AI search agents", () => {
  for (const kind of ["marketing", "agency", "talent_site"]) {
    const r = buildRobots(kind, base, { nonProduction: isNonProductionDeploy("production") });
    const rules = r.rules as Array<{ userAgent: string | string[]; allow?: string }>;
    assert.equal(rules[0].userAgent, "*", kind);
    assert.equal(rules[0].allow, "/", kind);
    assert.ok(rules.length >= 2, `${kind} lists the AI search agents`);
    assert.ok(r.sitemap, `${kind} has a sitemap`);
  }
});

test("preview and development deploys disallow everything on every indexable kind, no sitemap", () => {
  for (const env of ["preview", "development"]) {
    assert.equal(isNonProductionDeploy(env), true, env);
    for (const kind of ["marketing", "agency", "talent_site"]) {
      const r = buildRobots(kind, base, { nonProduction: isNonProductionDeploy(env) });
      assert.deepEqual(r.rules, DISALLOW_ALL, `${env}/${kind}`);
      assert.equal(r.sitemap, undefined, `${env}/${kind}`);
    }
  }
});

test("non-indexable host kinds (app, hub, unknown) are closed in every environment", () => {
  for (const kind of ["app", "hub", "unknown", "support"]) {
    assert.equal(isIndexableHostKind(kind), false, kind);
    for (const nonProduction of [true, false]) {
      assert.deepEqual(buildRobots(kind, base, { nonProduction }).rules, DISALLOW_ALL, `${kind}/${nonProduction}`);
    }
  }
});

test("an unset VERCEL_ENV (local dev, tests) keeps production behaviour", () => {
  assert.equal(isNonProductionDeploy(undefined), false);
  assert.equal(isNonProductionDeploy("production"), false);
});
