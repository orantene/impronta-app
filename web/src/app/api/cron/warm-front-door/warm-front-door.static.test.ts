import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The warmer exists because /support is ~350 ms warm and 3.6 to 4.2 s cold, and
// a low-traffic serverless route is cold for most first visits. It moves that
// cost off the visitor and onto a schedule.
//
// Two things have to stay true or it silently stops working: the cron has to be
// registered (a route nobody calls warms nothing), and it has to stay behind
// the same bearer auth as every other cron (an open endpoint that fetches URLs
// on request is a small SSRF surface and a free way to bill us for traffic).

const ROOT = process.cwd();
const ROUTE = readFileSync(
  join(ROOT, "src", "app", "api", "cron", "warm-front-door", "route.ts"),
  "utf8",
);
const VERCEL = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};

test("the warmer is actually scheduled", () => {
  const entry = VERCEL.crons.find((c) => c.path === "/api/cron/warm-front-door");
  assert.ok(entry, "route exists but no cron calls it, so nothing is ever warmed");
  assert.match(entry.schedule, /^\*\/\d+ /, `expected a minute interval, got "${entry.schedule}"`);
  const minutes = Number(entry.schedule.split(" ")[0].replace("*/", ""));
  // Measured, not assumed. At a 5 minute interval the warmer's own logs showed
  // /support answering in 3450, 3160, 2421 and 2344 ms across nine consecutive
  // pings: the function goes cold INSIDE five minutes, so a visitor arriving
  // between pings still found it cold. Four of nine pings were absorbing a cold
  // start rather than preventing one.
  assert.ok(
    minutes <= 3,
    `warming every ${minutes} min leaves a gap the function goes cold in; production showed cold starts at a 5 min interval`,
  );
});

test("the warmer refuses unauthenticated callers", () => {
  assert.match(ROUTE, /CRON_SECRET/, "no bearer secret check");
  assert.match(ROUTE, /status:\s*401/, "no unauthorized branch");
  assert.match(ROUTE, /status:\s*503/, "does not refuse to run when unconfigured");
});

test("the warmer cannot be pointed at an arbitrary host", () => {
  // It builds every URL from a fixed path list and the site base, never from
  // request input. An endpoint that fetched a caller-supplied URL would be an
  // SSRF hole wearing a performance hat.
  assert.doesNotMatch(ROUTE, /request\.(url|json|nextUrl)/, "warmer reads caller input");
  assert.match(ROUTE, /WARM_PATHS/, "no fixed path list");
});

test("a failed warm never takes the cron down", () => {
  // Best-effort by design: a warmer that throws turns a slow page into a paging
  // alert at 4am, which is worse than the cold start it was fixing.
  assert.match(ROUTE, /AbortController/, "no timeout");
  assert.match(ROUTE, /logServerError/, "failures are not logged");
  assert.doesNotMatch(ROUTE, /throw new/, "warmer throws");
});
