/**
 * TUL-1088: guard for the ES booking flow. A Spanish visitor must not see the English
 * service names the platform already knows (TUL-975), nor the zone note in the wrong
 * language (TUL-574), and the dictionary must never turn a Spanish title English.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { platformServiceTitle } from "./offering-title-fallback";

const ENGLISH_BOOKING_TITLES = ["Gel manicure", "Massage", "Couples massage"] as const;

describe("TUL-1088 / TUL-975: ES booking page service names", () => {
  it("the common English titles read in Spanish on /es", () => {
    const es = ENGLISH_BOOKING_TITLES.map((t) => platformServiceTitle(t, "es"));
    assert.deepEqual(es, ["Manicura en gel", "Masaje", "Masaje en pareja"]);
    for (const title of es) {
      assert.ok(title && !/\b(gel manicure|massage|couples)\b/i.test(title), `still English: ${title}`);
    }
  });

  it("matching ignores case and accents, like the rest of the dictionary", () => {
    assert.equal(platformServiceTitle("  GEL manicure ", "es"), "Manicura en gel");
    assert.equal(platformServiceTitle("couples MASSAGE", "es"), "Masaje en pareja");
  });

  it("is one way: a talent's own Spanish title is never turned into English on /en", () => {
    for (const spanish of ["Manicura en gel", "Masaje", "Masaje en pareja"]) {
      assert.equal(platformServiceTitle(spanish, "en"), null, `${spanish} must stay as written on /en`);
    }
  });

  it("the English locale and unknown titles are left alone (null = keep the title as written)", () => {
    assert.equal(platformServiceTitle("Gel manicure", "en"), null);
    assert.equal(platformServiceTitle("Some custom service", "es"), null);
  });
});

describe("TUL-1088 / TUL-574: the zone note follows the visitor's language", () => {
  const SPANISH_NOTE = "Fuera de esta zona se agrega traslado a la cotización.";
  const ENGLISH_NOTE = "Outside this area, travel is added to the quote.";
  const areaNode = {
    id: "area-1",
    kind: "visit",
    props: { layout: "area", arrivalNote: SPANISH_NOTE, i18n: { en: { arrivalNote: ENGLISH_NOTE } } },
  };

  it("ES shows the Spanish note and EN shows the English one, never the other way round", async () => {
    const { localizeBlockNode } = await import("@/lib/site-admin/builder-node/block-i18n");
    const es = localizeBlockNode(areaNode as never, { locale: "es", defaultLocale: "es", chain: [] }) as typeof areaNode;
    const en = localizeBlockNode(areaNode as never, { locale: "en", defaultLocale: "es", chain: ["es"] }) as typeof areaNode;
    assert.equal(es.props.arrivalNote, SPANISH_NOTE);
    assert.equal(en.props.arrivalNote, ENGLISH_NOTE);
    assert.ok(!/\b(outside|travel|quote)\b/i.test(es.props.arrivalNote), "English leaked into the ES note");
  });
});
