import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  facetOptionDisplayLabel,
  localizedFacetOptionLabel,
} from "./facet-option-label";

// Shape of `profile_field_definitions.option_labels_i18n` after the ML fields
// migration: `en` is seeded from the value itself, `es` from the old options_es.
const AVAILABILITY = {
  available_now: { en: "available_now", es: "Disponible ahora" },
  available_this_week: { en: "available_this_week", es: "Disponible esta semana" },
  by_request: { en: "by_request", es: "Por solicitud" },
  limited: { en: "limited" },
};

const BODY_TYPE = {
  Athletic: { en: "Athletic", es: "Atlético" },
  "Dark brown": { en: "Dark brown", es: "Castaño oscuro" },
};

describe("localizedFacetOptionLabel", () => {
  it("returns the Spanish catalog label for a slug", () => {
    assert.equal(localizedFacetOptionLabel(AVAILABILITY, "available_now", "es"), "Disponible ahora");
    assert.equal(
      localizedFacetOptionLabel(AVAILABILITY, "available_this_week", "es"),
      "Disponible esta semana",
    );
    assert.equal(localizedFacetOptionLabel(AVAILABILITY, "by_request", "es"), "Por solicitud");
  });

  it("returns null for English (the en entry only echoes the value)", () => {
    assert.equal(localizedFacetOptionLabel(AVAILABILITY, "available_now", "en"), null);
    assert.equal(localizedFacetOptionLabel(BODY_TYPE, "athletic", "en"), null);
  });

  it("returns null when the locale has no label, so the humanized slug wins", () => {
    assert.equal(localizedFacetOptionLabel(AVAILABILITY, "limited", "es"), null);
    assert.equal(localizedFacetOptionLabel(AVAILABILITY, "available_now", "fr"), null);
    assert.equal(localizedFacetOptionLabel(null, "available_now", "es"), null);
    assert.equal(localizedFacetOptionLabel(AVAILABILITY, "unknown_slug", "es"), null);
  });

  it("matches A-vocab slugs against B label-cased option values", () => {
    assert.equal(localizedFacetOptionLabel(BODY_TYPE, "athletic", "es"), "Atlético");
    assert.equal(localizedFacetOptionLabel(BODY_TYPE, "dark_brown", "es"), "Castaño oscuro");
  });
});

describe("facetOptionDisplayLabel", () => {
  it("keeps a server-resolved locale label verbatim (no title-casing)", () => {
    assert.equal(
      facetOptionDisplayLabel({ id: "available_this_week", label: "Disponible esta semana" }),
      "Disponible esta semana",
    );
  });

  it("humanizes a slug-only option exactly as before", () => {
    assert.equal(facetOptionDisplayLabel({ id: "available_now", label: "available_now" }), "Available Now");
    assert.equal(facetOptionDisplayLabel({ id: "by_request", label: "by_request" }), "By Request");
    assert.equal(facetOptionDisplayLabel({ id: "non_binary" }), "Non-Binary");
  });
});
