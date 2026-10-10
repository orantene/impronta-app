/**
 * GRK-052 — hub profile placeholders: bare "· FEE", DETAILS twice, lowercase names.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const servicesSrc = readFileSync(join(here, "_light/ServicesBlock.tsx"), "utf8");
const lightSrc = readFileSync(join(here, "_light/LightProfileLayout.tsx"), "utf8");
const detailCardSrc = readFileSync(join(here, "_light/DetailCard.tsx"), "utf8");
const profileSrc = readFileSync(join(here, "profile-view.tsx"), "utf8");

test("GRK-052: travel fee chip is not a bare · FEE placeholder", () => {
  assert.doesNotMatch(servicesSrc, /· fee["']/);
  assert.match(servicesSrc, /travel fee applies/);
  assert.match(servicesSrc, /aplica tarifa de viaje/);
});

test("GRK-052: DetailCard can hide a group title that repeats the section", () => {
  assert.match(detailCardSrc, /hideGroupTitle/);
  assert.match(lightSrc, /hideGroupTitle/);
  assert.match(lightSrc, /detailsLabels\.details/);
});

test("GRK-052: displayName soft-title-cases mono-case stage names", () => {
  assert.match(profileSrc, /softTitleCaseName/);
  assert.match(profileSrc, /function displayName/);
  assert.match(
    profileSrc,
    /displayName[\s\S]{0,200}softTitleCaseName/,
  );
});
