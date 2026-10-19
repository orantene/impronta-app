/**
 * F3 (TUL-1273 #2): the public read-only catalog API for businesses
 * (guest-sellable only, rate limited) and the one AI-access rule.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { aiAccessJson, resolveAiAccess } from "./ai-access";
import {
  BUSINESS_CATALOG_DEFAULT_LIMIT,
  BUSINESS_CATALOG_MAX_LIMIT,
  pageOf,
  parseCatalogPaging,
  toBusinessCatalogServices,
} from "./business-catalog";

const WEB = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

function offering(over: Partial<TalentOffering> = {}): TalentOffering {
  return {
    id: "o1",
    talentProfileId: null,
    ownerKind: "workspace",
    tenantId: "t1",
    kind: "service",
    title: " Fade ",
    description: "A  clean\nfade.",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 25000,
    currency: "MXN",
    durationMinutes: 30,
    category: "Hair",
    status: "published",
    visibility: "public",
    moderationState: "approved",
    attributes: {},
    imageUrls: [],
    ...over,
  } as TalentOffering;
}

test("only guest-sellable services are listed: published, approved, public", () => {
  const list = toBusinessCatalogServices(
    [
      offering({ id: "ok" }),
      offering({ id: "draft", status: "draft" }),
      offering({ id: "pending", moderationState: "pending" }),
      offering({ id: "rejected", moderationState: "rejected" }),
      offering({ id: "agency", visibility: "agency_only" }),
      offering({ id: "onreq", visibility: "on_request" }),
      offering({ id: "product", kind: "product" }),
    ],
    "en",
  );
  assert.deepEqual(list.map((s) => s.id), ["ok"]);
  assert.equal(list[0].guest_sellable, true);
});

test("row shape: cleaned text, duration, storefront price words and the stored figure", () => {
  const [s] = toBusinessCatalogServices([offering()], "en");
  assert.equal(s.title, "Fade");
  assert.equal(s.description, "A clean fade.");
  assert.equal(s.category, "Hair");
  assert.equal(s.duration_minutes, 30);
  assert.match(s.price, /250/);
  assert.equal(s.amount_cents, 25000);
  assert.equal(s.currency, "MXN");
});

test("D-10a: a quote service states no figure", () => {
  const [q] = toBusinessCatalogServices([offering({ priceDisplay: "quote", amountCents: 99900 })], "en");
  assert.equal(q.amount_cents, null);
  assert.doesNotMatch(JSON.stringify(q), /999/);
});

test("paging: defaults, caps, junk and the next offset", () => {
  assert.deepEqual(parseCatalogPaging(new URLSearchParams("")), { limit: BUSINESS_CATALOG_DEFAULT_LIMIT, offset: 0 });
  assert.equal(parseCatalogPaging(new URLSearchParams("limit=9999")).limit, BUSINESS_CATALOG_MAX_LIMIT);
  assert.equal(parseCatalogPaging(new URLSearchParams("limit=0")).limit, BUSINESS_CATALOG_DEFAULT_LIMIT);
  assert.deepEqual(parseCatalogPaging(new URLSearchParams("limit=abc&offset=-3")), { limit: BUSINESS_CATALOG_DEFAULT_LIMIT, offset: 0 });
  const all = Array.from({ length: 5 }, (_, i) => i);
  assert.deepEqual(pageOf(all, { limit: 2, offset: 0 }), { items: [0, 1], next_offset: 2 });
  assert.deepEqual(pageOf(all, { limit: 2, offset: 4 }), { items: [4], next_offset: null });
  assert.deepEqual(pageOf(all, { limit: 2, offset: 9 }), { items: [], next_offset: null });
});

test("AI access: reading is always open; booking only when a talent turned it on; a business has none yet", () => {
  assert.deepEqual(resolveAiAccess({ subject: "talent" }), { readCatalog: true, bookViaAssistant: false });
  assert.equal(resolveAiAccess({ subject: "talent", bookingSwitchOn: true }).bookViaAssistant, true);
  assert.equal(resolveAiAccess({ subject: "talent", bookingSwitchOn: null }).bookViaAssistant, false);
  assert.equal(resolveAiAccess({ subject: "business", bookingSwitchOn: true }).bookViaAssistant, false);
  const json = aiAccessJson(resolveAiAccess({ subject: "business" }));
  assert.equal(json.read_catalog, true);
  assert.equal(json.book_via_assistant, false);
  assert.match(json.booking_note, /off/i);
});

test("the route is rate limited, tenant-host only, read-only, and reachable on every host kind it serves", () => {
  const route = read("src/app/api/public/booking/business-catalog/route.ts");
  assert.match(route, /checkBookingSlots\(resolvePublicClientIp/);
  assert.match(route, /status: 429/);
  assert.match(route, /host\.kind !== "agency" && host\.kind !== "hub"/);
  assert.match(route, /status: 404/);
  assert.match(route, /toBusinessCatalogServices\(/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  for (const kind of ["agency", "hub"] as const) {
    assert.equal(isPathAllowedForHostKind(kind, "/api/public/booking/business-catalog"), true, kind);
  }
});

test("the loader filters guest-sellable in the query and drops QA test services", () => {
  const loader = read("src/lib/offerings/business-catalog.server.ts");
  assert.match(loader, /scopeToGuestSellableOfferings\(/);
  assert.match(loader, /eq\("tenant_id", tenantId\)/);
  assert.match(loader, /hideTestServiceOnPublicSite/);
});
