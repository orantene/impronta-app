import assert from "node:assert/strict";
import test from "node:test";

import { dashboardTabTitle } from "./dashboard-tab-title";

test("dashboardTabTitle uses page · Tulala when a page label is set", () => {
  assert.equal(dashboardTabTitle({ pageLabel: "Perfil" }), "Perfil · Tulala");
  assert.equal(dashboardTabTitle({ pageLabel: "Hoy" }), "Hoy · Tulala");
  assert.equal(dashboardTabTitle({ pageLabel: "Settings" }), "Settings · Tulala");
});

test("dashboardTabTitle falls back to bare Tulala with no page", () => {
  assert.equal(dashboardTabTitle({ pageLabel: "" }), "Tulala");
  assert.equal(dashboardTabTitle({ pageLabel: null }), "Tulala");
});

test("dashboardTabTitle prefixes unread count", () => {
  assert.equal(
    dashboardTabTitle({ pageLabel: "Mensajes", unread: 3 }),
    "(3) Mensajes · Tulala",
  );
  assert.equal(dashboardTabTitle({ pageLabel: null, unread: 2 }), "(2) Tulala");
});
