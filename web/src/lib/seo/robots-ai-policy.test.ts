/**
 * TUL-1326: AI search ON, AI training OFF, one toggle that fails closed.
 * A small robots.txt evaluator (longest matching path wins, allow beats
 * disallow on a tie) proves what each bot class may fetch.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { MetadataRoute } from "next";

import { AI_CRAWLER_USER_AGENTS as MODEL_LIST, applyAiCrawlerToggle } from "@/lib/cms/posts-public-model";
import { loadAiCrawlersAllowed, readAiCrawlersFlag } from "@/lib/cms/posts-public-site";

import {
  AI_ANSWER_USER_AGENTS,
  AI_CRAWLER_USER_AGENTS,
  AI_SEARCH_USER_AGENTS,
  AI_TRAINING_USER_AGENTS,
  buildRobots,
} from "./robots-rules";

const WEB = path.resolve(__dirname, "../../..");
const SITE = new URL("https://luna.example.com");

type Group = { agents: string[]; allow: string[]; disallow: string[] };

function groups(r: MetadataRoute.Robots): Group[] {
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  return rules.map((x) => ({
    agents: (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent ?? "*"]).map((a) => a.toLowerCase()),
    allow: x.allow === undefined ? [] : Array.isArray(x.allow) ? x.allow : [x.allow],
    disallow: x.disallow === undefined ? [] : Array.isArray(x.disallow) ? x.disallow : [x.disallow],
  }));
}

/** Can `ua` fetch `p`? The bot's own group wins over `*`; longest match wins; allow wins a tie. */
function canFetch(r: MetadataRoute.Robots, ua: string, p: string): boolean {
  const gs = groups(r);
  const own = gs.filter((g) => g.agents.includes(ua.toLowerCase()));
  const use = own.length > 0 ? own : gs.filter((g) => g.agents.includes("*"));
  let best = { len: -1, allow: true };
  for (const g of use) {
    for (const a of g.allow) if (p.startsWith(a) && a.length >= best.len) best = { len: a.length, allow: true };
    for (const d of g.disallow) if (p.startsWith(d) && d.length > best.len) best = { len: d.length, allow: false };
  }
  return best.len < 0 ? true : best.allow;
}

for (const kind of ["marketing", "agency", "talent_site"] as const) {
  const robots = buildRobots(kind, SITE);

  test(`${kind}: every AI TRAINING crawler is refused everywhere`, () => {
    assert.ok(AI_TRAINING_USER_AGENTS.length >= 10);
    for (const ua of AI_TRAINING_USER_AGENTS) {
      for (const p of ["/", "/services", "/llms.txt", "/api/public/booking/catalog", "/sitemap.xml"]) {
        assert.equal(canFetch(robots, ua, p), false, `${ua} must not fetch ${p}`);
      }
    }
  });

  test(`${kind}: AI SEARCH agents may read pages, llms.txt and the public read endpoints`, () => {
    for (const ua of AI_ANSWER_USER_AGENTS) {
      for (const p of ["/", "/servicios/corte", "/llms.txt", "/api/public/booking/catalog", "/api/public/booking/business-catalog"]) {
        assert.equal(canFetch(robots, ua, p), true, `${ua} must fetch ${p}`);
      }
    }
  });

  test(`${kind}: ...but not the private parts, and the rest of /api/ stays closed`, () => {
    for (const ua of AI_SEARCH_USER_AGENTS) {
      for (const p of ["/api/stripe/webhook", "/api/analytics/events", "/admin/x", "/preview/y"]) {
        assert.equal(canFetch(robots, ua, p), false, `${ua} must not fetch ${p}`);
      }
    }
  });

  test(`${kind}: ordinary crawlers keep the old rules (no /api/ at all)`, () => {
    assert.equal(canFetch(robots, "SomeOtherBot", "/"), true);
    assert.equal(canFetch(robots, "SomeOtherBot", "/api/public/booking/catalog"), false);
  });
}

test("non-indexable hosts stay closed to everyone", () => {
  const r = buildRobots("app", SITE);
  for (const ua of [...AI_TRAINING_USER_AGENTS, ...AI_ANSWER_USER_AGENTS, "Googlebot"]) assert.equal(canFetch(r, ua, "/"), false, ua);
});

test("toggle OFF refuses EVERY AI bot (training and answer), keeps Googlebot and Bingbot", () => {
  const off = applyAiCrawlerToggle(buildRobots("talent_site", SITE), false);
  for (const ua of AI_CRAWLER_USER_AGENTS) {
    for (const p of ["/", "/llms.txt", "/api/public/booking/catalog"]) assert.equal(canFetch(off, ua, p), false, `${ua} ${p}`);
  }
  for (const ua of ["Googlebot", "Bingbot"]) assert.equal(canFetch(off, ua, "/"), true, ua);
  assert.equal(canFetch(off, "SomeOtherBot", "/"), true);
});

test("toggle ON changes nothing: answer agents in, training still out", () => {
  const base = buildRobots("talent_site", SITE);
  const on = applyAiCrawlerToggle(base, true);
  assert.deepEqual(on, base);
  assert.equal(canFetch(on, "GPTBot", "/"), false);
  assert.equal(canFetch(on, "OAI-SearchBot", "/"), true);
});

test("ONE bot list: the toggle uses the same list robots.txt is built from", () => {
  assert.deepEqual([...MODEL_LIST], [...AI_CRAWLER_USER_AGENTS]);
  assert.deepEqual([...AI_CRAWLER_USER_AGENTS], [...AI_TRAINING_USER_AGENTS, ...AI_ANSWER_USER_AGENTS]);
  // no bot is both training and answer
  assert.equal(new Set(AI_CRAWLER_USER_AGENTS).size, AI_CRAWLER_USER_AGENTS.length);
  // the answer agents named in the card are all covered
  for (const ua of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User"]) {
    assert.ok((AI_ANSWER_USER_AGENTS as readonly string[]).includes(ua), ua);
  }
  for (const ua of ["GPTBot", "Google-Extended", "CCBot", "ClaudeBot", "Bytespider", "anthropic-ai"]) {
    assert.ok((AI_TRAINING_USER_AGENTS as readonly string[]).includes(ua), ua);
  }
});

test("the toggle FAILS CLOSED: an unreadable flag refuses the AI bots", async () => {
  // No Supabase env in the test run: the flag cannot be read.
  const scope = { kind: "tenant", tenantId: "t1" } as Parameters<typeof loadAiCrawlersAllowed>[0];
  assert.equal(await readAiCrawlersFlag(scope), null);
  assert.equal(await loadAiCrawlersAllowed(scope), false);
});

test("robots.ts fails closed when the site cannot be resolved or the flag read throws", () => {
  const src = fs.readFileSync(path.join(WEB, "src/app/robots.ts"), "utf8");
  assert.match(src, /catch \{\s*return applyAiCrawlerToggle\(base, false\);/);
  assert.match(src, /loadAiCrawlersAllowed\(site\.scope\)\.catch\(\(\) => false\)/);
  assert.doesNotMatch(src, /\.catch\(\(\) => true\)/);
});

test("the owner's own screen still shows the default (ON) when the flag is unreadable", () => {
  const src = fs.readFileSync(path.join(WEB, "src/lib/cms/posts-ai-toggle.ts"), "utf8");
  assert.match(src, /\(await readAiCrawlersFlag\(scope\)\) \?\? true/);
});
