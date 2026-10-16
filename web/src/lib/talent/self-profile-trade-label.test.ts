import assert from "node:assert/strict";
import test from "node:test";

import {
  primaryRoleLabelsFromTaxonomy,
  selfProfileTradeLabel,
} from "./self-profile-trade-label";

test("selfProfileTradeLabel prefers ES when locale is Spanish", () => {
  assert.equal(
    selfProfileTradeLabel(
      {
        primaryTypeLabel: "Airbnb Turnover Cleaner",
        primaryTypeLabelEs: "Limpieza de Airbnb",
      },
      "es",
    ),
    "Limpieza de Airbnb",
  );
});

test("selfProfileTradeLabel keeps EN on English locale", () => {
  assert.equal(
    selfProfileTradeLabel(
      {
        primaryTypeLabel: "Airbnb Turnover Cleaner",
        primaryTypeLabelEs: "Limpieza de Airbnb",
      },
      "en",
    ),
    "Airbnb Turnover Cleaner",
  );
});

test("selfProfileTradeLabel falls back to EN when ES missing", () => {
  assert.equal(
    selfProfileTradeLabel({ primaryTypeLabel: "Nail Artist", primaryTypeLabelEs: null }, "es-MX"),
    "Nail Artist",
  );
});

test("selfProfileTradeLabel returns null when no EN label", () => {
  assert.equal(selfProfileTradeLabel({ primaryTypeLabel: null }, "es"), null);
  assert.equal(selfProfileTradeLabel(null, "es"), null);
});

test("primaryRoleLabelsFromTaxonomy reads primary_role name_i18n", () => {
  assert.deepEqual(
    primaryRoleLabelsFromTaxonomy([
      {
        relationship_type: "secondary_role",
        taxonomy_terms: { name_i18n: { en: "Host", es: "Anfitriona" } },
      },
      {
        relationship_type: "primary_role",
        taxonomy_terms: {
          name_i18n: { en: "Airbnb Turnover Cleaner", es: "Limpieza de Airbnb" },
        },
      },
    ]),
    { en: "Airbnb Turnover Cleaner", es: "Limpieza de Airbnb" },
  );
});

test("primaryRoleLabelsFromTaxonomy handles empty embeds", () => {
  assert.deepEqual(primaryRoleLabelsFromTaxonomy(null), { en: null, es: null });
  assert.deepEqual(primaryRoleLabelsFromTaxonomy([]), { en: null, es: null });
});
