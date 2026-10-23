/**
 * QA bounce (history "#3909"): a package or product grid in the public
 * Services section was fixed at its usual column count, so exactly ONE item
 * sat in one column of an otherwise-empty grid — a half-width card beside a
 * large stray gap. Same bug class TUL-848 already fixed for the builder's
 * `services_catalog` grid (`effectiveCatalogColumns`); `storefrontGridClass`
 * applies the same rule here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { StorefrontBody, storefrontGridClass } from "./StorefrontBody";

test("storefrontGridClass: one item never leaves a half-width card beside an empty cell", () => {
  assert.equal(storefrontGridClass({ base: 1, sm: 2 }, 1), "grid gap-3 grid-cols-1");
  assert.equal(storefrontGridClass({ base: 2, sm: 3 }, 1), "grid gap-3 grid-cols-1");
});

test("storefrontGridClass: two items fill exactly two columns, no third empty cell", () => {
  assert.equal(storefrontGridClass({ base: 2, sm: 3 }, 2), "grid gap-3 grid-cols-2");
});

test("storefrontGridClass: enough items keeps the usual responsive column counts, unchanged", () => {
  assert.equal(storefrontGridClass({ base: 1, sm: 2 }, 3), "grid gap-3 grid-cols-1 sm:grid-cols-2");
  assert.equal(storefrontGridClass({ base: 2, sm: 3 }, 3), "grid gap-3 grid-cols-2 sm:grid-cols-3");
});

const offering = (over: Partial<TalentOffering> = {}): TalentOffering =>
  ({
    id: "pkg-1",
    talentProfileId: "tp-1",
    ownerKind: "talent",
    tenantId: "33333333-3333-4333-8333-333333333333",
    kind: "package",
    title: "Full glam package",
    description: null,
    status: "published",
    visibility: "public",
    moderationState: "approved",
    amountCents: 120000,
    currency: "MXN",
    priceType: "fixed",
    durationMinutes: 120,
    bookingMode: "instant",
    imageUrls: [],
    isFeatured: false,
    variants: [],
    addOns: [],
    ...over,
  }) as unknown as TalentOffering;

test("a single package card renders full-width, not half-width beside an empty cell", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, { visible: [offering()], locale: "en" }),
  );
  assert.match(html, /class="grid gap-3 grid-cols-1"/);
  assert.doesNotMatch(html, /sm:grid-cols-2/);
});

test("two package cards keep the usual 1-up phone / 2-up desktop layout (unchanged, since 2 exactly fills it)", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontBody, {
      visible: [offering({ id: "pkg-1" }), offering({ id: "pkg-2" })],
      locale: "en",
    }),
  );
  assert.match(html, /class="grid gap-3 grid-cols-1 sm:grid-cols-2"/);
});
