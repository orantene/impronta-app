/**
 * TUL-1464: MATCH_ME_ENABLED gates the whole match-me feature (client Match tab, the professional's
 * "Jobs for you", both actions, the list loaders) until the held migration 20261231421100 is applied.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";
import { MATCH_ME_FLAG, matchMeEnabled } from "./flag";
import { acceptMatchAsTalent, requestMatch } from "./match-me-actions";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

async function withFlag<T>(v: string | undefined, fn: () => Promise<T> | T): Promise<T> {
  const prev = process.env[MATCH_ME_FLAG];
  if (v === undefined) delete process.env[MATCH_ME_FLAG];
  else process.env[MATCH_ME_FLAG] = v;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[MATCH_ME_FLAG];
    else process.env[MATCH_ME_FLAG] = prev;
  }
}

test("the flag is OFF unless exactly \"true\"", () => {
  assert.equal(MATCH_ME_FLAG, "MATCH_ME_ENABLED");
  assert.equal(matchMeEnabled({}), false);
  for (const v of ["", "1", "yes", "on", "TRUE", "false"]) assert.equal(matchMeEnabled({ MATCH_ME_ENABLED: v }), false, v);
  assert.equal(matchMeEnabled({ MATCH_ME_ENABLED: "true" }), true);
});

test("OFF: both actions refuse politely with reason \"off\" before reading anything", async () => {
  await withFlag(undefined, async () => {
    assert.deepEqual(await requestMatch({ description: "Clean my flat", zone: "Tulum" }), { ok: false, reason: "off" });
    assert.deepEqual(await acceptMatchAsTalent({ requestId: "00000000-0000-4000-8000-000000000000" }), { ok: false, reason: "off" });
  });
  await withFlag("false", async () => {
    assert.deepEqual(await requestMatch({ description: "x" }), { ok: false, reason: "off" });
  });
});

test("the gate is the FIRST line of both actions; past it (ON) the old checks run unchanged", () => {
  const src = read("src/lib/match-me/match-me-actions.ts");
  for (const name of ["requestMatch", "acceptMatchAsTalent"]) {
    const body = src.slice(src.indexOf(`export async function ${name}`));
    const firstLine = body.split("\n")[1]!.trim();
    assert.equal(firstLine, 'if (!matchMeEnabled()) return { ok: false, reason: "off" };', name);
    assert.ok(body.indexOf("matchMeEnabled()") < body.indexOf("assertNotImpersonating()"), name);
  }
});

test("OFF hides every surface: account tab, Jobs for you page, loaders; ON shows them", () => {
  const tenant = read("src/lib/client-account/render-tenant-area.tsx");
  assert.match(tenant, /const matchOn = matchMeEnabled\(\);/);
  assert.match(tenant, /matchEnabled=\{matchOn\}/);
  assert.match(tenant, /requestedView\.tab === "match" && !matchOn \? \{ kind: "home", tab: "visits" \}/);
  assert.match(tenant, /view\.tab === "match" && matchOn\) data\.match = await loadMyMatchRequests/);
  const page = read("src/app/(workspace)/[tenantSlug]/talent/match-offers/page.tsx");
  assert.match(page, /if \(!matchMeEnabled\(\)\) notFound\(\);/);
  assert.ok(page.indexOf("notFound()") < page.indexOf("loadMyMatchOffers("), "404 before any read");
  const loaders = read("src/lib/match-me/match-views.server.ts");
  assert.equal(loaders.match(/if \(!matchMeEnabled\(\) \|\| !admin/g)?.length, 2, "both loaders (and so the lazy widen) are off too");
});

const area = (matchEnabled: boolean, tab: "match" | "visits" = "match") =>
  renderToStaticMarkup(
    createElement(ClientAccountArea, {
      locale: "en", audience: "client", view: { kind: "home", tab }, talentName: "Hub", email: "c@example.com", timeZone: "UTC",
      matchEnabled,
      data: { match: [], visits: { upcoming: [], waiting: [], past: [] }, profile: { name: "Cli", phone: "", locale: "en", marketingOptIn: false } },
    } as never),
  );

test("OFF: ?tab=match renders Visits, no Match tab link, no form", () => {
  const html = area(false);
  assert.doesNotMatch(html, /tab=match/);
  assert.doesNotMatch(html, /What do you need\?/);
  assert.match(html, /No visits yet\./);
});

test("ON: the Match tab and its form are there", () => {
  const html = area(true);
  assert.match(html, /href="\/account\?tab=match"/);
  assert.match(html, /What do you need\?/);
  assert.match(area(true, "visits"), /href="\/account\?tab=match"/);
});
