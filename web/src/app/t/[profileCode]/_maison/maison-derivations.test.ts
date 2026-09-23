/**
 * What the template says about a talent when nobody has authored it.
 *
 * Both functions here exist because the template shipped with one studio's
 * facts written into its copy — "Todos los precios en pesos mexicanos (MXN)"
 * was TEMPLATE text, so an Argentine talent's menu would have told her clients
 * the wrong country's currency. A reusable template must derive or say nothing.
 *
 * Run: node_modules/.bin/tsx --test 'src/app/t/[profileCode]/_maison/maison-derivations.test.ts'
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentOffering } from "@/lib/talent/offerings-types";

import { derivedVisiting, priceNoteFor } from "./maison-derive";

function priced(currency: string): TalentOffering {
  return { id: currency, title: "s", currency } as TalentOffering;
}

describe("priceNoteFor", () => {
  const TEMPLATE = "All prices in {currency}.";

  it("names the currency when the whole catalogue agrees", () => {
    const out = priceNoteFor([priced("MXN"), priced("MXN")], "en", TEMPLATE);
    assert.ok(out, "expected a note");
    assert.ok(out!.includes("MXN"));
    assert.ok(!out!.includes("{currency}"), "placeholder must be replaced");
  });

  it("says NOTHING when the catalogue mixes currencies", () => {
    // Naming one of them would be false for the other rows on the same menu.
    assert.equal(priceNoteFor([priced("MXN"), priced("ARS")], "en", TEMPLATE), null);
  });

  it("says nothing for an empty catalogue", () => {
    assert.equal(priceNoteFor([], "en", TEMPLATE), null);
  });

  it("ignores case and blank currency values", () => {
    const out = priceNoteFor([priced("mxn"), priced("")], "en", TEMPLATE);
    assert.ok(out && out.includes("MXN"));
  });

  it("falls back to the bare code when Intl has no name for it", () => {
    const out = priceNoteFor([priced("XTS")], "en", TEMPLATE);
    assert.ok(out, "expected a note");
    // Never "XTS (XTS)".
    assert.ok(!/XTS \(XTS\)/.test(out!));
  });
});

const C = {
  visitWhere: "Where",
  visitTravels: "Travels to",
  visitLanguages: "Languages",
  visitRemote: "Online",
} as never;

function props(over: Record<string, unknown>) {
  return {
    locale: "en",
    livesIn: null,
    languages: [],
    serviceAreas: [],
    ...over,
  } as never;
}

function area(kind: string, name: string | null, id = kind) {
  return {
    id,
    service_kind: kind,
    travel_radius_km: null,
    travel_fee_required: false,
    display_order: 0,
    locations: name ? { display_name_i18n: { en: name, es: name }, country_code: null } : null,
  };
}

describe("derivedVisiting", () => {
  it("returns null when there is nothing to say", () => {
    // The band must hide itself rather than render an empty heading.
    assert.equal(derivedVisiting(props({}), C), null);
  });

  it("uses the home_base area for where she works", () => {
    const v = derivedVisiting(props({ serviceAreas: [area("home_base", "Playa del Carmen")] }), C);
    assert.equal(v?.facts[0]?.value, "Playa del Carmen");
    assert.equal(v?.facts[0]?.icon, "place");
  });

  it("falls back to livesIn when no area row names a place", () => {
    const v = derivedVisiting(props({ livesIn: "Tulum" }), C);
    assert.equal(v?.facts[0]?.value, "Tulum");
  });

  it("lists travel_to areas separately from the base", () => {
    const v = derivedVisiting(
      props({
        serviceAreas: [area("home_base", "Playa"), area("travel_to", "Tulum", "t1")],
      }),
      C,
    );
    assert.equal(v?.facts.length, 2);
    assert.equal(v?.facts[1]?.value, "Tulum");
  });

  it("says online only when remote and there is nowhere to travel to", () => {
    const v = derivedVisiting(props({ serviceAreas: [area("remote_only", null)] }), C);
    assert.equal(v?.facts[0]?.value, "Online");
  });

  it("prefers the page's language for a place name", () => {
    const a = area("home_base", null);
    a.locations = { display_name_i18n: { en: "Mexico City", es: "Ciudad de México" }, country_code: null };
    const es = derivedVisiting(props({ locale: "es-MX", serviceAreas: [a] }), C);
    assert.equal(es?.facts[0]?.value, "Ciudad de México");
  });

  it("adds languages when the profile lists them", () => {
    const v = derivedVisiting(props({ languages: ["Español", "English"] }), C);
    assert.equal(v?.facts[0]?.label, "Languages");
    assert.equal(v?.facts[0]?.value, "Español · English");
  });
});
