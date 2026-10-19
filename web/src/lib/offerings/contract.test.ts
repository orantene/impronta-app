/**
 * F2: one structured record per service feeds the page facts, JSON-LD,
 * markdown, llms.txt and the public API.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { toAgentApiServices, toAgentContracts } from "@/lib/booking/agent/agent-contracts";
import { buildTalentLlmsTxt } from "@/lib/seo/talent-llms-txt";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import {
  OFFERING_CONTRACT_VERSION,
  buildOfferingContract,
  contractToApiService,
  contractToFactsLine,
  contractToJsonLd,
  contractToLlmsLine,
  contractToMarkdown,
  contractsToMarkdown,
} from "./contract";

const WEB = path.resolve(__dirname, "../../..");

function offering(over: Partial<TalentOffering> = {}): TalentOffering {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    talentProfileId: "tp1",
    ownerKind: "talent",
    tenantId: "t1",
    kind: "service",
    title: "  Corte de cabello ",
    description: "Corte   y\n peinado.",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 55000,
    currency: "MXN",
    bookingMode: null,
    reserveMode: "full",
    depositPct: null,
    allowPayInPerson: false,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: 60,
    category: "Cabello",
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: null,
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: 0,
    attributes: {},
    imageUrls: ["https://x.test/a.jpg"],
    ...over,
  } as TalentOffering;
}

const ctx = { locale: "es", url: "https://luna.test/servicio-corte-11111111", providerName: "Luna" };

test("the contract carries the cleaned fields once", () => {
  const c = buildOfferingContract(offering(), ctx);
  assert.equal(c.title, "Corte de cabello");
  assert.equal(c.description, "Corte y peinado.");
  assert.equal(c.durationMinutes, 60);
  assert.equal(c.price.mode, "exact");
  assert.equal(c.price.amountCents, 55000);
  assert.equal(c.price.currency, "MXN");
  assert.match(c.price.text, /550/);
  assert.equal(c.guestSellable, true);
  assert.equal(c.bookable, true);
  assert.equal(c.imageUrl, "https://x.test/a.jpg");
});

test("one source: every surface states the SAME price words and duration", () => {
  const c = buildOfferingContract(offering(), ctx);
  const api = contractToApiService(c);
  assert.equal(api.price, c.price.text);
  assert.equal(api.amount_cents, 55000);
  assert.ok(contractToLlmsLine(c).includes(c.price.text));
  assert.ok(contractToLlmsLine(c).includes("(60 min)"));
  assert.ok(contractToMarkdown(c).includes(`Price: ${c.price.text}`));
  assert.ok(contractToFactsLine(c).startsWith(c.price.text));
  const ld = contractToJsonLd(c) as { offers?: { price: string; priceCurrency: string }; name: string };
  assert.equal(ld.name, "Corte de cabello");
  assert.deepEqual([ld.offers?.price, ld.offers?.priceCurrency], ["550.00", "MXN"]);
});

test("D-10a: on request and quote carry NO figure on any surface", () => {
  for (const over of [
    { visibility: "on_request" as const, amountCents: 99900 },
    { priceDisplay: "quote" as const, amountCents: 99900 },
    { amountCents: null },
  ]) {
    const c = buildOfferingContract(offering(over), ctx);
    assert.equal(c.price.amountCents, null);
    assert.equal(contractToApiService(c).amount_cents, null);
    const ld = contractToJsonLd(c);
    assert.equal("offers" in ld, false);
    const all = [contractToLlmsLine(c), contractToMarkdown(c), contractToFactsLine(c), JSON.stringify(ld), JSON.stringify(contractToApiService(c))].join("\n");
    assert.doesNotMatch(all, /999|99900/);
  }
});

test("guest-sellable is the D-10 rule: published, approved and public", () => {
  assert.equal(buildOfferingContract(offering(), ctx).guestSellable, true);
  assert.equal(buildOfferingContract(offering({ visibility: "on_request" }), ctx).guestSellable, false);
  assert.equal(buildOfferingContract(offering({ visibility: "agency_only" }), ctx).guestSellable, false);
  assert.equal(buildOfferingContract(offering({ moderationState: "pending" }), ctx).guestSellable, false);
  assert.equal(buildOfferingContract(offering({ status: "draft" }), ctx).guestSellable, false);
  assert.equal(buildOfferingContract(offering({ publicCtaHidden: true }), ctx).bookable, false);
});

test("summary is capped at 280 characters with an ellipsis; full text is kept", () => {
  const long = "palabra ".repeat(80);
  const c = buildOfferingContract(offering({ description: long }), ctx);
  assert.ok((c.summary ?? "").length <= 280);
  assert.ok((c.summary ?? "").endsWith("…"));
  assert.ok((c.description ?? "").length > 280);
});

test("the public API list is built from the contract and keeps its filters", () => {
  const list = toAgentApiServices(
    [offering(), offering({ id: "p", kind: "product" }), offering({ id: "r", visibility: "on_request" })],
    "en",
  );
  assert.deepEqual(list.map((s) => s.id), ["11111111-1111-4111-8111-111111111111"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["amount_cents", "bookable", "currency", "description", "duration_minutes", "id", "price", "price_mode", "title"]);
  const contracts = toAgentContracts([offering()], "en", { providerName: "Luna", pageUrl: () => "https://luna.test/s" });
  assert.equal(contracts[0].providerName, "Luna");
  assert.equal(contracts[0].url, "https://luna.test/s");
  assert.match(contractsToMarkdown("Luna", contracts), /^# Luna\n\n## Corte de cabello\n\nPrice: /);
});

test("llms.txt Services come from the contracts when given, else the old list", () => {
  const c = buildOfferingContract(offering(), { locale: "en" });
  const withContracts = buildTalentLlmsTxt(new URL("https://luna.test"), {
    name: "Luna", trade: null, city: null, languages: [], services: [{ title: "OLD", priceText: "x" }], contracts: [c],
  });
  assert.ok(withContracts.includes(contractToLlmsLine(c)));
  assert.ok(!withContracts.includes("OLD"));
  const fallback = buildTalentLlmsTxt(new URL("https://luna.test"), {
    name: "Luna", trade: null, city: null, languages: [], services: [{ title: "OLD", priceText: "x" }],
  });
  assert.ok(fallback.includes("- OLD: x"));
});

test("wiring: the catalog route serves markdown from the same contracts; llms loader builds them", () => {
  const route = fs.readFileSync(path.join(WEB, "src/app/api/public/booking/catalog/route.ts"), "utf8");
  assert.match(route, /contractsToMarkdown\(site\.name, contracts\)/);
  assert.match(route, /text\/markdown/);
  const loader = fs.readFileSync(path.join(WEB, "src/lib/seo/talent-llms-txt.server.ts"), "utf8");
  assert.match(loader, /toAgentContracts\(offerings, llmsLocale/);
  const site = fs.readFileSync(path.join(WEB, "src/lib/booking/agent/agent-site.server.ts"), "utf8");
  assert.match(site, /toAgentApiServices\(offerings, site\.locale\)/);
});

test("D-10a: listings include on_request with the price withheld; the bookable API list does not", () => {
  const list = [offering(), offering({ id: "r", visibility: "on_request", amountCents: 99900 }), offering({ id: "p", kind: "product" })];
  const contracts = toAgentContracts(list, "en");
  assert.deepEqual(contracts.map((c) => c.id), ["11111111-1111-4111-8111-111111111111", "r"]);
  const onReq = contracts[1];
  assert.equal(onReq.price.amountCents, null);
  assert.equal(onReq.guestSellable, false);
  const llms = buildTalentLlmsTxt(new URL("https://luna.test"), { name: "Luna", trade: null, city: null, languages: [], services: [], contracts });
  assert.match(llms, /- Corte de cabello: .*550/);
  assert.doesNotMatch(llms, /999/);
  assert.match(llms, /On request/);
  assert.deepEqual(toAgentApiServices(list, "en").map((s) => s.id), ["11111111-1111-4111-8111-111111111111"]);
});

test("the catalog route varies on Accept (JSON and markdown share a URL)", () => {
  const route = fs.readFileSync(path.join(WEB, "src/app/api/public/booking/catalog/route.ts"), "utf8");
  assert.equal((route.match(/Vary: "Accept"/g) ?? []).length, 2);
});

// ─── TUL-1327: version, from-price, fail closed ──────────────────────────────

test("the contract is versioned", () => {
  const c = buildOfferingContract(offering(), ctx);
  assert.equal(c.version, OFFERING_CONTRACT_VERSION);
  assert.equal(OFFERING_CONTRACT_VERSION, 1);
});

test("a FROM price is a lowest price everywhere: words say from/desde, JSON-LD is AggregateOffer.lowPrice, never an exact price", () => {
  const es = buildOfferingContract(offering({ priceDisplay: "from" }), { locale: "es", providerName: "Luna" });
  const en = buildOfferingContract(offering({ priceDisplay: "from" }), { locale: "en", providerName: "Luna" });
  assert.equal(es.price.mode, "from");
  assert.match(es.price.text, /desde/i);
  assert.match(en.price.text, /from/i);
  assert.match(contractToMarkdown(es), /Price: .*desde/i);
  assert.match(contractToLlmsLine(en), /from/i);
  const ld = contractToJsonLd(en) as { offers: Record<string, unknown> };
  assert.equal(ld.offers["@type"], "AggregateOffer");
  assert.equal(ld.offers.lowPrice, "550.00");
  assert.equal("price" in ld.offers, false);
  assert.equal(JSON.stringify(ld).includes("minPrice"), false);
  assert.equal(contractToApiService(en).price_mode, "from");
});

test("schema: exact, quote and on-request JSON-LD shapes", () => {
  const exact = contractToJsonLd(buildOfferingContract(offering(), ctx)) as { offers: Record<string, unknown>; "@type": string };
  assert.equal(exact["@type"], "Service");
  assert.deepEqual(exact.offers, { "@type": "Offer", price: "550.00", priceCurrency: "MXN" });
  for (const over of [{ priceDisplay: "quote" as const }, { visibility: "on_request" as const }]) {
    const ld = contractToJsonLd(buildOfferingContract(offering(over), ctx));
    assert.equal("offers" in ld, false);
    assert.equal(ld["@context"], "https://schema.org");
  }
});

test("fail closed: a source that does not say published + approved + public is not guest-sellable", () => {
  const base = buildOfferingContract(offering(), ctx);
  assert.equal(base.guestSellable, true);
  for (const missing of ["status", "moderationState", "visibility"] as const) {
    const o = { ...offering() } as Record<string, unknown>;
    delete o[missing];
    assert.equal(buildOfferingContract(o as unknown as TalentOffering, ctx).guestSellable, false, `missing ${missing}`);
  }
});

test("llms.txt services read in the talent's language", () => {
  const loader = fs.readFileSync(path.join(WEB, "src/lib/seo/talent-llms-txt.server.ts"), "utf8");
  assert.match(loader, /preferred_locale/);
  assert.match(loader, /const llmsLocale = .*startsWith\("es"\) \? "es" : "en"/);
  assert.doesNotMatch(loader, /loadPublicOfferingsForProfile\(talentProfileId, "en"/);
});
