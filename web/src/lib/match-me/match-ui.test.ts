/**
 * TUL-1598: the client's "Match me with a professional" tab, the professional's "Jobs for you" screen,
 * and the lazy 2-hour widen. ES + EN.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";
import { MATCH_OFFERS_COPY } from "./match-me-copy";
import type { MyMatchRequest } from "./views";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const mine: MyMatchRequest[] = [
  { id: "r1", description: "Clean my flat", zone: "Tulum", status: "accepted", createdAt: "2026-10-20T10:00:00Z", offeredCount: 5, proName: "Ana" },
  { id: "r2", description: "Photos for a party", zone: null, status: "open", createdAt: "2026-10-19T10:00:00Z", offeredCount: 5, proName: null },
];
const area = (locale: "en" | "es", over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ClientAccountArea, {
      locale, audience: "client", view: { kind: "home", tab: "match" }, talentName: "Hub", email: "c@example.com", timeZone: "UTC",
      matchEnabled: true,
      data: { match: mine, profile: { name: "Cli", phone: "", locale, marketingOptIn: false } },
      ...over,
    } as never),
  );

test("the Match tab shows the form and the client's requests, EN and ES; only the accepted one names a professional", () => {
  const en = area("en");
  assert.match(en, /Match me with a professional/);
  assert.match(en, /What do you need\?/);
  assert.match(en, /Ana accepted/);
  assert.match(en, /Waiting for a professional/);
  assert.match(en, /href="\/account\?tab=match"/);
  const es = area("es");
  assert.match(es, /Encuéntrame un profesional/);
  assert.match(es, /Ana aceptó/);
  assert.match(es, /Esperando a un profesional/);
  assert.match(es, /Buscar profesional/);
});

test("without matchEnabled (a talent site) the tab is not in the nav and shows no form", () => {
  const html = area("en", { matchEnabled: false });
  assert.doesNotMatch(html, /tab=match/);
  assert.doesNotMatch(html, /What do you need\?/);
});

test("the professional screen: EN + ES copy, accept through the action, no client contact fields", () => {
  for (const loc of ["en", "es"] as const) for (const v of Object.values(MATCH_OFFERS_COPY[loc])) assert.ok(v.length > 0 && !v.includes("—"));
  assert.equal(MATCH_OFFERS_COPY.es.heading, "Trabajos para ti");
  const list = read("src/app/(workspace)/[tenantSlug]/talent/match-offers/MatchOffersList.tsx");
  assert.match(list, /acceptMatchAsTalent\(\{ requestId: o\.requestId \}\)/);
  const page = read("src/app/(workspace)/[tenantSlug]/talent/match-offers/page.tsx");
  assert.match(page, /requireTalentSelf\(\)/);
  assert.match(page, /loadMyMatchOffers\(me\.talentProfile\.id\)/);
  const loader = read("src/lib/match-me/match-views.server.ts");
  const offers = loader.slice(loader.indexOf("export async function loadMyMatchOffers"));
  assert.doesNotMatch(offers, /client_user_id|email|phone/i, "the offers loader never selects the client");
});

test("lazy widen: no cron; any list read widens due open requests, scoped to the tenant, and tells the new recipients", () => {
  const loader = read("src/lib/match-me/match-views.server.ts");
  assert.match(loader, /shouldWiden\(/);
  assert.match(loader, /widenIfDue\(r\.id, r\.tenant_id,/);
  assert.match(loader, /notifyMatchOffered\(/);
  const mineFn = loader.slice(loader.indexOf("export async function loadMyMatchRequests"), loader.indexOf("export async function loadMyMatchOffers"));
  assert.match(mineFn, /\.eq\("client_user_id", userId\)/);
  assert.match(mineFn, /\.eq\("tenant_id", tenantId\)/);
  assert.match(mineFn, /await widenDueRequests\(/);
  const tenant = read("src/lib/client-account/render-tenant-area.tsx");
  assert.match(tenant, /view\.tab === "match"[\s\S]{0,80}loadMyMatchRequests\(userId, tenantId\)/);
});
