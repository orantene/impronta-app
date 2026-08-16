/**
 * gated-url-optimizer.test.ts — does a minted gated-media URL survive
 * `next/image`?
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The gated-media URL grammar shipped, was switched on in production, and blew
 * up every talent photo on the public directory. Nothing caught it. The tests
 * that existed at the time were not weak — they covered minting, signing,
 * forgery, surface separation, the precedence table, and the route's own
 * behavior, and every one of them passed. A direct `curl` of the route passed
 * too: it 302'd to a signed storage URL and returned `image/jpeg`.
 *
 * The bug lived in the ONE hop nobody tested. Talent cards do not fetch the
 * gated URL directly; they hand it to `next/image`, which re-requests it as
 * `/_next/image?url=<encoded>&w=…&q=…`. Next refuses to optimize a LOCAL path
 * carrying a query string unless `images.localPatterns` permits it, and the
 * permission is NOT opt-out: `next/dist/server/config` normalizes an absent
 * `images.localPatterns` to `[{ pathname: "**", search: "" }]` — every path,
 * but only with an EMPTY query string. The old `?s=<surface>&k=<sig>` grammar
 * therefore hit `"url" parameter is not allowed` → HTTP 400 → broken image,
 * while the route it pointed at was perfectly healthy.
 *
 * So this file tests the hop, not the endpoints of it.
 *
 * WHAT MAKES THIS DIFFERENT FROM A MOCK
 * ─────────────────────────────────────
 * Nothing here re-implements Next's rules — re-implementing them is how a guard
 * ends up green while measuring nothing, since the copy would have been written
 * from the same wrong assumption that caused the outage. Instead it uses:
 *
 *   • Next's own config loader, on THIS REPO'S REAL `next.config.ts`, so the
 *     default-`localPatterns` injection is the real one and a future edit to
 *     that file is inside the blast radius of this test; and
 *   • Next's own `ImageOptimizerCache.validateParams`, which is the exact
 *     function the `/_next/image` handler calls to produce that 400.
 *
 * If Next changes the rule, this test changes verdict with it.
 *
 * THE NEGATIVE CONTROL IS PART OF THE GUARD
 * ─────────────────────────────────────────
 * A test that only asserts "the current URL is accepted" would keep passing if
 * the harness silently stopped validating anything. So it also asserts that the
 * RETIRED query-string grammar is still REJECTED by the same machinery. That
 * one assertion is the proof the wiring is live, and it is the assertion that
 * would have gone red on the PR that caused the outage.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { IncomingMessage } from "node:http";

import loadConfig from "next/dist/server/config";
import { PHASE_PRODUCTION_BUILD } from "next/dist/shared/lib/constants";
import { ImageOptimizerCache } from "next/dist/server/image-optimizer";

import { GATED_MEDIA_ROUTE, gatedMediaPath } from "./private-access";

const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ASSET = "dddddddd-dddd-dddd-dddd-dddddddddddd";

/**
 * The `web/` directory, i.e. the one holding `next.config.ts`.
 *
 * Resolved from the cwd rather than the module URL so the file works under both
 * the CJS and ESM shapes `tsx --test` can pick, and asserted rather than assumed
 * — a config silently loaded from the wrong directory would fall back to Next's
 * bare defaults and quietly turn this whole file into a no-op.
 */
function projectDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, "next.config.ts"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(
    `could not locate next.config.ts from cwd ${process.cwd()}; this guard must ` +
      "load the REAL config or it proves nothing",
  );
}

/** Load + normalize the real next.config.ts once. Next's own loader, not ours. */
let configPromise: ReturnType<typeof loadConfig> | null = null;
function realNextConfig() {
  configPromise ??= loadConfig(PHASE_PRODUCTION_BUILD, projectDir());
  return configPromise;
}

/**
 * Ask the real optimizer whether it would serve `url`, exactly as the
 * `/_next/image` handler does. Returns `null` when accepted, or the error
 * message that becomes an HTTP 400.
 */
async function optimizerRejection(url: string): Promise<string | null> {
  const nextConfig = await realNextConfig();
  const result = ImageOptimizerCache.validateParams(
    { headers: {} } as unknown as IncomingMessage,
    { url, w: "640", q: "75" },
    nextConfig,
    false,
  );
  return "errorMessage" in result ? result.errorMessage : null;
}

const SECRET_ENV = "MEDIA_URL_SIGNING_SECRET";

/** Mint a real gated URL with a real signature, restoring the env afterwards. */
function mint(surface: string | null): string {
  const prev = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = "test-secret-do-not-ship";
  try {
    const url = gatedMediaPath(ASSET, surface, true);
    assert.ok(url, "gatedMediaPath must mint a URL when gating is on");
    return url;
  } finally {
    if (prev === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = prev;
  }
}

// ─── 1. the hop that broke production ───────────────────────────────────────

test("a minted tenant-surface URL is accepted by the real image optimizer", async () => {
  const url = mint(TENANT);
  assert.equal(
    await optimizerRejection(url),
    null,
    `next/image would refuse to optimize ${url}, so every gated photo renders ` +
      "as a broken image. The URL grammar and images.localPatterns disagree.",
  );
});

test("a minted master-surface URL is accepted by the real image optimizer", async () => {
  const url = mint(null);
  assert.equal(await optimizerRejection(url), null, url);
});

// ─── 2. the negative control: proof the harness is actually validating ───────

test("the retired query-string grammar is still rejected by the same machinery", async () => {
  // Byte-for-byte the shape that shipped in #1164 and broke the directory.
  const legacy = `${GATED_MEDIA_ROUTE}/${ASSET}?s=${TENANT}&k=abc123`;
  assert.equal(
    await optimizerRejection(legacy),
    '"url" parameter is not allowed',
    "the optimizer no longer rejects a local path with a query string — either " +
      "Next changed its rule or this guard has stopped validating anything. " +
      "Do NOT 'fix' this by deleting the assertion; re-read the module header.",
  );
});

test("a gated URL carries no query string at all", () => {
  for (const surface of [TENANT, null]) {
    const url = mint(surface);
    assert.equal(
      new URL(url, "http://n").search,
      "",
      `gated URLs must stay query-free to survive next/image: ${url}`,
    );
  }
});

// ─── 3. the proxy must not eat the optimizer's internal request ─────────────

/**
 * The REAL matcher regex out of `src/proxy.ts`, not a copy of it.
 *
 * Parsed from source rather than imported because importing the proxy pulls in
 * the whole middleware dependency graph; the string literal is the actual
 * contract Next compiles, so reading it is faithful.
 */
function proxyMatcher(): RegExp {
  const source = fs.readFileSync(path.join(projectDir(), "src", "proxy.ts"), "utf8");
  const block = source.slice(source.indexOf("matcher: ["));
  // Anchored on the pattern's own opening `/((?!` rather than "first quoted
  // string after matcher:", because the prose above the literal contains
  // double-quoted text too — the negative control below caught exactly that.
  const literal = block.match(/"(\/\(\(\?!(?:[^"\\]|\\.)*)"/);
  assert.ok(literal, "could not find the proxy matcher literal in src/proxy.ts");
  // ANCHORED, because Next matches a matcher pattern against the WHOLE
  // pathname. Left unanchored the negative lookahead is trivially satisfied at
  // some later `/` and every path "matches", which would make this guard
  // silently useless in the permissive direction.
  return new RegExp(`^(?:${JSON.parse(`"${literal[1]}"`) as string})$`);
}

test("the proxy does not intercept gated media URLs", () => {
  // `next/image` fetches a LOCAL path through `fetchInternalImage()`, which
  // builds a mocked req/res carrying NO headers — so no `Host`. If the proxy
  // runs on that request, host resolution fails, it rewrites to
  // `/_host-unregistered` (404), and the optimizer answers 400 for a route that
  // is perfectly healthy. This is the third of the three blockers that had to
  // fall before a gated photo could render; it is invisible to every test that
  // stops at the route or the config.
  const matcher = proxyMatcher();
  for (const surface of [TENANT, null]) {
    const url = mint(surface);
    assert.equal(
      matcher.test(url),
      false,
      `the proxy matcher intercepts ${url}. The optimizer's internal request ` +
        "carries no Host header, so the proxy will 404 it and every gated photo " +
        "renders broken. Keep `api/media/asset` in the matcher's exclusion list.",
    );
  }
});

test("the proxy still guards ordinary routes", () => {
  // Negative control for the exclusion above: proof the matcher is real and
  // that the carve-out is narrow rather than accidentally disabling the gate.
  const matcher = proxyMatcher();
  for (const guarded of ["/directory", "/admin/settings", "/api/inquiries"]) {
    assert.equal(matcher.test(guarded), true, `${guarded} must still go through the proxy`);
  }
});

// ─── 4. the fix must not be bought at the cost of every other local image ────

test("ordinary local images are still optimizable", async () => {
  // Declaring `images.localPatterns` REPLACES Next's `{ pathname: "**" }`
  // default rather than extending it. So the tempting one-line fix for the
  // gated route — allow-list `/api/media/asset/**` — silently blanks every
  // other local image on the platform unless the author also re-adds the
  // default by hand. This is that landmine, wired to a red test.
  for (const url of [
    "/talent-templates/demo/impronta-2026/lifestyle-2.jpg",
    "/_next/static/media/logo.abc123.png",
  ]) {
    assert.equal(
      await optimizerRejection(url),
      null,
      `${url} is no longer optimizable — an images.localPatterns edit has ` +
        "narrowed what next/image will serve.",
    );
  }
});
