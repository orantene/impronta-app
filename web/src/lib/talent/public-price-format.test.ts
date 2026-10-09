/**
 * TUL-516: shared public price labels (Consultar, desde, $N MXN, min cents).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPublicFromMoney,
  formatPublicMoney,
  publicBarPriceLabel,
  publicCatalogPriceLabel,
  publicConsultLabel,
  publicFromWord,
  publicPricedParts,
} from "./public-price-format";

const nb = (s: string) => s.replace(/\u00a0/g, " ");

describe("public money format (TUL-516)", () => {
  it("is always $amount CODE (never bare $ or MX$)", () => {
    assert.equal(nb(formatPublicMoney(55000, "MXN", "es")), "$550 MXN");
    assert.equal(nb(formatPublicMoney(55000, "MXN", "en")), "$550 MXN");
    assert.doesNotMatch(nb(formatPublicMoney(55000, "MXN", "en")), /MX\$/);
  });

  it("groups thousands for chat prefills", () => {
    assert.equal(nb(formatPublicMoney(150000, "MXN", "es")), "$1,500 MXN");
    assert.equal(nb(formatPublicMoney(150000, "MXN", "en")), "$1,500 MXN");
  });

  it("from-word is lowercase once (book-jorgelina)", () => {
    assert.equal(publicFromWord("es"), "desde");
    assert.equal(publicFromWord("en"), "from");
    assert.equal(nb(formatPublicFromMoney(50000, "MXN", "es")), "desde $500 MXN");
    assert.equal(nb(formatPublicFromMoney(50000, "MXN", "en")), "from $500 MXN");
  });

  it("$0 / missing → Consultar / Ask", () => {
    assert.equal(publicConsultLabel("es"), "Consultar");
    assert.equal(publicConsultLabel("en"), "Ask");
    const zero = {
      priceDisplay: "exact" as const,
      priceType: "fixed",
      amountCents: 0,
      currency: "MXN",
      variants: [],
      visibility: "public" as const,
      attributes: {},
    };
    assert.equal(publicCatalogPriceLabel(zero as never, "es"), "Consultar");
    assert.equal(publicCatalogPriceLabel(zero as never, "en"), "Ask");
    assert.equal(publicBarPriceLabel(zero as never, "es"), "Consultar");
  });

  it("hero and card share min cents for a ladder", () => {
    const item = {
      priceDisplay: "exact" as const,
      priceType: "fixed",
      amountCents: 55000,
      currency: "MXN",
      variants: [
        { id: "a", label: "Casa", amountCents: 55000 },
        { id: "b", label: "Depa", amountCents: 50000 },
      ],
      visibility: "public" as const,
      attributes: {},
    };
    // Multi-variant → desde + cheapest (same string for hero fact and card).
    assert.equal(nb(publicCatalogPriceLabel(item as never, "es")), "desde $500 MXN");
    assert.equal(nb(publicBarPriceLabel(item as never, "es")), "desde $500 MXN");
  });

  it("USD hint stays a separate part (own muted line)", () => {
    const parts = publicPricedParts(70000, "MXN", "es", "≈ US$38");
    assert.ok(parts);
    assert.equal(nb(parts!.primary), "$700 MXN");
    assert.equal(parts!.usd, "≈ US$38");
    assert.doesNotMatch(parts!.primary, /≈/);
  });
});
