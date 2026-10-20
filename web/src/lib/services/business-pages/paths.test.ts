import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  businessServicePathWithoutLocale,
  businessServiceRoute,
  businessServiceSegment,
  businessServiceSlug,
  isBusinessServicePagePath,
  parseBusinessServiceSlug,
} from "./paths";

const ID = "1a2b3c4d-0000-4000-8000-000000000000";

describe("business service URL grammar (TUL-1272 #5)", () => {
  it("Spanish word in Spanish, English word otherwise", () => {
    assert.equal(businessServiceSegment("es"), "servicios");
    assert.equal(businessServiceSegment("es-MX"), "servicios");
    assert.equal(businessServiceSegment("en"), "services");
    assert.equal(businessServiceSegment("fr"), "services");
  });

  it("clean slug: title words then the id8, no 'servicio-' prefix", () => {
    assert.equal(businessServiceSlug({ id: ID, title: "Masaje relajante 60 min" }), "masaje-relajante-60-min-1a2b3c4d");
    assert.equal(businessServiceSlug({ id: ID, title: "¡¡!!" }), "1a2b3c4d");
    assert.equal(businessServicePathWithoutLocale("es", "x-1a2b3c4d"), "/servicios/x-1a2b3c4d");
    assert.equal(businessServicePathWithoutLocale("en", "x-1a2b3c4d"), "/services/x-1a2b3c4d");
  });

  it("parses the id8; refuses anything else", () => {
    assert.equal(parseBusinessServiceSlug("masaje-1a2b3c4d"), "1a2b3c4d");
    assert.equal(parseBusinessServiceSlug("1a2b3c4d"), "1a2b3c4d");
    assert.equal(parseBusinessServiceSlug("masaje"), null);
    assert.equal(parseBusinessServiceSlug("Masaje-1A2B3C4D"), null);
    assert.equal(parseBusinessServiceSlug("masaje--1a2b3c4d"), null);
    assert.equal(parseBusinessServiceSlug(""), null);
  });

  it("gate: only two-segment service paths, never the single-segment list (a CMS page may own /servicios)", () => {
    assert.equal(isBusinessServicePagePath("/servicios/masaje-1a2b3c4d"), true);
    assert.equal(isBusinessServicePagePath("/services/1a2b3c4d"), true);
    assert.equal(isBusinessServicePagePath("/servicios"), false);
    assert.equal(isBusinessServicePagePath("/services/"), false);
    assert.equal(isBusinessServicePagePath("/services/a/b"), false);
    assert.equal(isBusinessServicePagePath("/servicios/Bad Slug"), false);
  });
});

describe("businessServiceRoute", () => {
  const offering = { id: ID, title: "Masaje relajante" };
  it("missing when the slug carries no id8 or no row matches", () => {
    assert.deepEqual(businessServiceRoute({ requested: { segment: "services", slug: "masaje" }, locale: "en", offering: null }), { kind: "missing" });
    assert.deepEqual(businessServiceRoute({ requested: { segment: "services", slug: "x-1a2b3c4d" }, locale: "en", offering: null }), { kind: "missing" });
    assert.deepEqual(
      businessServiceRoute({ requested: { segment: "services", slug: "x-ffffffff" }, locale: "en", offering }),
      { kind: "missing" },
    );
  });
  it("render at the canonical path", () => {
    assert.deepEqual(
      businessServiceRoute({ requested: { segment: "services", slug: "masaje-relajante-1a2b3c4d" }, locale: "en", offering }),
      { kind: "render", slug: "masaje-relajante-1a2b3c4d" },
    );
  });
  it("301 to the current slug after a rename, and to the locale's own word", () => {
    assert.deepEqual(
      businessServiceRoute({ requested: { segment: "servicios", slug: "masaje-viejo-1a2b3c4d" }, locale: "es", offering }),
      { kind: "redirect", pathWithoutLocale: "/servicios/masaje-relajante-1a2b3c4d" },
    );
    assert.deepEqual(
      businessServiceRoute({ requested: { segment: "services", slug: "masaje-relajante-1a2b3c4d" }, locale: "es", offering }),
      { kind: "redirect", pathWithoutLocale: "/servicios/masaje-relajante-1a2b3c4d" },
    );
  });
});
