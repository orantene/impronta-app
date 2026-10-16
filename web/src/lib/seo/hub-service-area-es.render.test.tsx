import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ServicesBlock } from "@/app/t/[profileCode]/_light/ServicesBlock";

/**
 * TUL-1080 (guard for TUL-912). The hub profile's service-area chips (based in,
 * travels to, remote, fee) rendered English on `/es/t/<code>`. This renders the
 * real block in ES and EN and asserts the visible text.
 */

type Area = Parameters<typeof ServicesBlock>[0]["serviceAreas"][number];

const area = (id: string, kind: Area["service_kind"], city: string | null, fee = false): Area => ({
  id,
  service_kind: kind,
  travel_radius_km: null,
  travel_fee_required: fee,
  display_order: 0,
  locations: city ? { display_name_i18n: { en: city, es: city }, country_code: "MX" } : null,
});

const AREAS: Area[] = [
  area("a", "home_base", "Cancún", true),
  area("b", "travel_to", "Tulum", true),
  area("c", "travel_to", "Playa del Carmen"),
  area("d", "remote_only", null),
];

function render(locale: "es" | "en"): string {
  return renderToStaticMarkup(
    createElement(ServicesBlock, {
      packageTeasers: [],
      serviceAreas: AREAS,
      startingFrom: null,
      bookingNote: null,
      locale,
      heading: locale === "es" ? "Servicios" : "Services",
      packagesLabel: locale === "es" ? "Paquetes" : "Packages",
      bookingDetailsLabel: locale === "es" ? "Detalles" : "Details",
    }),
  );
}

/** Visible text only: tags stripped, entities left as is, whitespace collapsed. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const ENGLISH_ROW_WORDS = /\b(based in|travels to|remote|fee)\b/i;

test("TUL-1080: ES service-area rows read Spanish (based in, travels to, remote, fee)", () => {
  const visible = text(render("es"));
  assert.match(visible, /Con base en: Cancún/);
  assert.match(visible, /Viaja a: Tulum/);
  assert.match(visible, /Viaja a: Playa del Carmen/);
  assert.match(visible, /Remoto/);
  assert.match(visible, /· con costo/);
});

test("TUL-1080: ES service-area rows contain no English words", () => {
  const visible = text(render("es"));
  assert.equal(ENGLISH_ROW_WORDS.test(visible), false, `English leaked into: ${visible}`);
});

test("TUL-1080: the fee marker only shows on rows that charge a travel fee", () => {
  const visible = text(render("es"));
  assert.equal(visible.match(/con costo/g)?.length, 2);
});

test("TUL-1080: EN rows still read English (the ES guard is not 'always Spanish')", () => {
  const visible = text(render("en"));
  assert.match(visible, /Based in: Cancún/);
  assert.match(visible, /Travels to: Tulum/);
  assert.match(visible, /Remote/);
  assert.match(visible, /· fee/);
  assert.equal(/Con base en|Viaja a|con costo/.test(visible), false);
});

test("TUL-1080: GUARD BITES: the English render trips the English-word detector", () => {
  assert.equal(ENGLISH_ROW_WORDS.test(text(render("en"))), true);
});
