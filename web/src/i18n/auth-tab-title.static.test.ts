/**
 * TUL-518: /es/login showed the English root title ("Tulala · Sell what you
 * do…"). The auth layout's fallback title follows the request language; the
 * whitelabel agency title (TUL-64) still wins where it applies.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { dashboardTabTitle } from "./dashboard-metadata";

const layout = readFileSync(join(__dirname, "..", "app", "(auth)", "layout.tsx"), "utf8");

test("auth layout fallback title is the localized brand line", () => {
  assert.match(layout, /const localized: Metadata = \{ \.\.\.AUTH_ROBOTS, title: \{ absolute: dashboardTabTitle\(await getRequestLocale\(\)\) \} \}/);
  assert.doesNotMatch(layout, /return AUTH_ROBOTS;/);
  // TUL-870: no brand → the localized line; a brand → its title (plus the other head fields).
  assert.match(layout, /if \(!brand\) return localized;/);
  assert.match(layout, /title: \{ absolute: brand\.title \}/);
  assert.equal(dashboardTabTitle("es"), "Tulala · Vende lo que haces, no lo que envías");
});
