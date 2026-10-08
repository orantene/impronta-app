import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardTabTitle } from "./dashboard-metadata";

test("dashboard tab title follows the dashboard language", () => {
  assert.equal(dashboardTabTitle("es"), "Tulala · Vende lo que haces, no lo que envías");
  assert.equal(dashboardTabTitle("en"), "Tulala · Sell what you do, not what you ship");
});
