import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { StorefrontBody } from "./StorefrontBody";

// TUL-1272: a hub card for a row another workspace sells links to that
// workspace's booking page; it never opens checkout in the hub tenant.
const offering = (over: Partial<TalentOffering> = {}): TalentOffering =>
  ({
    id: "off-1",
    talentProfileId: "tp-1",
    ownerKind: "talent",
    tenantId: "33333333-3333-4333-8333-333333333333",
    kind: "service",
    title: "Gel manicure",
    description: null,
    status: "published",
    visibility: "public",
    moderationState: "approved",
    amountCents: 45000,
    currency: "MXN",
    priceType: "fixed",
    durationMinutes: 60,
    bookingMode: "instant",
    imageUrls: [],
    isFeatured: false,
    variants: [],
    addOns: [],
    ...over,
  }) as unknown as TalentOffering;

const OWNER = "https://staging-qa-journeys.tulala.digital/book?service=off-1";

test("hub card with an owner booking href renders a link to the owner's page, not the hub checkout button", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, { visible: [offering()], locale: "es", ownerBookHrefs: { "off-1": OWNER } }),
  );
  assert.match(html, /data-owner-book-link="off-1"/);
  assert.ok(html.includes(`href="${OWNER}"`));
  assert.doesNotMatch(html, /data-offering-cta=/);
  assert.match(html, /Reservar/);
});

test("owner link copy is translated (en)", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, { visible: [offering()], locale: "en", ownerBookHrefs: { "off-1": OWNER } }),
  );
  assert.match(html, />Book</);
});

test("an owner row with no resolvable booking page shows no action (never the hub checkout)", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, { visible: [offering()], locale: "en", ownerBookHrefs: { "off-1": null } }),
  );
  assert.doesNotMatch(html, /data-offering-cta=/);
  assert.doesNotMatch(html, /data-owner-book-link=/);
  assert.match(html, /Gel manicure/);
});

test("non-hub hosts are unchanged: no owner map keeps the in-place CTA", () => {
  const html = renderToStaticMarkup(createElement(StorefrontBody, { visible: [offering()], locale: "en" }));
  assert.match(html, /data-offering-cta=/);
  assert.doesNotMatch(html, /data-owner-book-link=/);
});

test("on_request hub card shows no price digits (D-10a)", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, {
      visible: [offering({ visibility: "on_request" })],
      locale: "es",
      ownerBookHrefs: { "off-1": OWNER },
    }),
  );
  const priceCell = html.match(/tabular-nums[^>]*>([^<]*)/)?.[1] ?? "";
  assert.doesNotMatch(priceCell, /\d/);
  assert.match(priceCell, /Bajo consulta/);
});

test("TUL-1267: the hub link-out to the owner's booking page is rel=nofollow (same tab)", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, { visible: [offering()], locale: "en", ownerBookHrefs: { "off-1": OWNER } }),
  );
  const anchor = html.match(/<a [^>]*data-owner-book-link="off-1"[^>]*>/)?.[0] ?? "";
  assert.match(anchor, /rel="nofollow"/);
  assert.doesNotMatch(anchor, /target=/);
});
