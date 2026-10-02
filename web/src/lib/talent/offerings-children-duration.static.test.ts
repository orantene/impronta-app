/**
 * BUF wire — loadOfferingChildren must select and map addon duration_minutes
 * so the vanity catalog can pass durationMinutes into CatalogBookingSheet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "offerings-children.ts"), "utf8");

test("addon select includes duration_minutes", () => {
  assert.match(
    SRC,
    /talent_offering_addons[\s\S]{0,200}select\([^)]*duration_minutes/,
    "select must request duration_minutes for addons",
  );
});

test("mapped OfferingAddOn includes durationMinutes", () => {
  assert.match(
    SRC,
    /list\.push\(\{\s*id: r\.id,\s*label,\s*amountCents: cents,\s*durationMinutes/,
    "push must include durationMinutes on each addon",
  );
  assert.match(SRC, /duration_minutes > 0/, "only positive durations map through");
});
