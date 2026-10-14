import { test } from "node:test";
import assert from "node:assert/strict";

import { CLIENTS_ES_TEXT } from "./dashboard-i18n-clients";
import { TALENT_CLIENT_PANELS_ES_TEXT } from "./dashboard-i18n-talent-client-panels";
import { TALENT_GAPS_ES_TEXT } from "./dashboard-i18n-talent-gaps";

// TUL-721: the add-client actions read "Agregar clienta" (gendered).
// The button is for any client, so it uses the inclusive form.
test("add-client actions are inclusive in Spanish", () => {
  const cases: Array<[Record<string, string>, string]> = [
    [CLIENTS_ES_TEXT, "Add client"],
    [TALENT_CLIENT_PANELS_ES_TEXT, "Add client"],
    [TALENT_GAPS_ES_TEXT, "Add a client"],
  ];
  for (const [dict, key] of cases) {
    assert.equal(dict[key], "Agregar cliente", `${key} must be inclusive`);
  }
});
