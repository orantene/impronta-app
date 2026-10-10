import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUBLIC_TALENT_HOSTS,
  checkPublicTalentHosts,
  findPinnedTalentHosts,
  judgePublicHostResponse,
} from "./public-talent-hosts.mjs";

test("200 is public; a 302 to the Vercel SSO wall is a failure naming the host", () => {
  assert.deepEqual(judgePublicHostResponse({ host: "a.tulala.digital", status: 200 }), { ok: true });
  const v = judgePublicHostResponse({
    host: "jorg-beauty-qa.tulala.digital",
    status: 302,
    location: "https://vercel.com/sso-api?url=https%3A%2F%2Fjorg-beauty-qa.tulala.digital%2F",
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /jorg-beauty-qa\.tulala\.digital.*login wall/);
  assert.equal(judgePublicHostResponse({ host: "x", status: 500 }).ok, false);
});

test("the 2026-10-09 pins are flagged; platform, QA pool and staging aliases are allowed", () => {
  const aliases = [
    { alias: "jorg-beauty-qa.tulala.digital", deployment: { url: "tulala-koro0os5n-oran-tenes-projects.vercel.app" } },
    { alias: "alex-trevino-demo.tulala.digital", deployment: { url: "tulala-koro0os5n-oran-tenes-projects.vercel.app" } },
    { alias: "tulala.digital" },
    { alias: "app.tulala.digital" },
    { alias: "impronta.tulala.digital" },
    { alias: "qa-3.tulala.digital" },
    { alias: "staging-qa-app.tulala.digital" },
    { alias: "tulala-git-feat-x-oran-tenes-projects.vercel.app" },
    { alias: "old-pin.tulala.digital", deletedAt: 1 },
  ];
  const pinned = findPinnedTalentHosts(aliases).map((p) => p.alias);
  assert.deepEqual(pinned, ["jorg-beauty-qa.tulala.digital", "alex-trevino-demo.tulala.digital"]);
});

test("the smoke check fails a login-walled host and a pinned alias, and warns without a token", async () => {
  const fails = [];
  const warns = [];
  const passes = [];
  const deps = {
    get: async (url) =>
      url.includes("mateo-ferrer-demo")
        ? { status: 302, headers: { location: "https://vercel.com/sso-api?url=x" } }
        : { status: 200, headers: {} },
    pass: (l) => passes.push(l),
    fail: (l, r) => fails.push(r),
    warn: (l, r) => warns.push(r),
    env: {},
    fetchJson: async () => ({ aliases: [] }),
  };
  await checkPublicTalentHosts(deps);
  assert.equal(passes.length, PUBLIC_TALENT_HOSTS.length - 1);
  assert.equal(fails.length, 1);
  assert.match(fails[0], /mateo-ferrer-demo/);
  assert.match(warns[0], /VERCEL_TOKEN not set/);

  fails.length = 0;
  await checkPublicTalentHosts({
    ...deps,
    get: async () => ({ status: 200, headers: {} }),
    env: { VERCEL_TOKEN: "t" },
    fetchJson: async () => ({ aliases: [{ alias: "mateo-ferrer-demo.tulala.digital", deployment: { url: "d.vercel.app" } }] }),
  });
  assert.equal(fails.length, 1);
  assert.match(fails[0], /mateo-ferrer-demo\.tulala\.digital -> d\.vercel\.app/);
});
