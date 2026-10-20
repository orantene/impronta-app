import assert from "node:assert/strict";
import test from "node:test";

import { DATED_SETTINGS_COPY, datedSettingsCopy } from "@/components/admin/shell/internal/page-modules/series-dated-settings-copy";

test("EN and ES carry the same keys, none empty, no em dashes", () => {
  assert.deepEqual(Object.keys(DATED_SETTINGS_COPY.en).sort(), Object.keys(DATED_SETTINGS_COPY.es).sort());
  for (const lang of ["en", "es"] as const) {
    for (const [k, v] of Object.entries(DATED_SETTINGS_COPY[lang])) {
      assert.ok(v.trim().length > 0, `${lang}.${k}`);
      assert.ok(!v.includes("—"), `${lang}.${k} has an em dash`);
    }
  }
});

test("the locale picks Spanish for es and es-MX, English otherwise", () => {
  assert.equal(datedSettingsCopy("es").stopSelling, "Dejar de vender antes del inicio");
  assert.equal(datedSettingsCopy("es-MX").perTier, "Lugares por fecha");
  assert.equal(datedSettingsCopy("fr").stopSelling, "Stop selling before the start");
});
