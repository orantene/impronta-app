import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { citySubtitles } from "./city-subtitle";

test("TUL-803: Spanish reads México, from the country name or Google's English line", () => {
  assert.deepEqual(citySubtitles({ country_name_en: "Mexico", country_name_es: "México" }), { en: "Mexico", es: "México" });
  assert.deepEqual(
    citySubtitles({ subtitle: "Quintana Roo, Mexico", country_name_en: "Mexico", country_name_es: "México" }),
    { en: "Quintana Roo, Mexico", es: "Quintana Roo, México" },
  );
  // "New Mexico" is not the country.
  assert.equal(citySubtitles({ subtitle: "New Mexico, USA", country_name_en: "United States", country_name_es: "Estados Unidos" }).es, "New Mexico, USA");
  assert.deepEqual(citySubtitles({ country_name_en: "", country_name_es: null }), { en: null, es: null });
});

test("the onboarding picker shows the Spanish line to Spanish visitors", () => {
  const step = readFileSync(join(process.cwd(), "src/components/onboarding/steps/essentials-step.tsx"), "utf8");
  assert.match(step, /locale === "es" \? c\.subtitleEs \?\? c\.subtitle : c\.subtitle/);
  assert.match(readFileSync(join(process.cwd(), "src/lib/server-actions/onboarding-lookups.ts"), "utf8"), /subtitleEs: sub\.es/);
});
