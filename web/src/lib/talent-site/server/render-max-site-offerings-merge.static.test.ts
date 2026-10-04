import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"),
  "utf8",
);

test("vanity render merges loadPublicOfferingsForProfile into services_catalog dataSources", () => {
  assert.match(SRC, /loadPublicOfferingsForProfile\(talentProfileId/);
  assert.match(
    SRC,
    /talentOfferings:\s*\n?\s*Array\.isArray\(dataSources\.talentOfferings\)/,
  );
  assert.match(SRC, /: talentOfferings,/);
});
