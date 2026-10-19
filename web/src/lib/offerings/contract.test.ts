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
  assert.deepEqual(Object.keys(list[0]).sort(), ["amount_cents", "bookable", "currency", "description", "duration_minutes", "id", "price", "title"]);
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
  assert.match(loader, /toAgentContracts\(offerings, "en"/);
  const site = fs.readFileSync(path.join(WEB, "src/lib/booking/agent/agent-site.server.ts"), "utf8");
  assert.match(site, /toAgentApiServices\(offerings, site\.locale\)/);
});
