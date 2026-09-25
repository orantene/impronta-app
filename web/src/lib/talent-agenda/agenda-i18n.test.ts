import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agendaI18n } from "./agenda-i18n";

describe("T9.4 agenda i18n", () => {
  it("returns Spanish for known keys and falls back for unknown", () => {
    const t = agendaI18n("es");
    assert.equal(t("Today"), "Hoy");
    assert.equal(t("Calendar view"), "Vista de calendario");
    assert.equal(t("Add event or block"), "Añadir evento o bloqueo");
    assert.equal(t("Confirm transfer"), "Confirmar transferencia");
    assert.equal(t("Collect"), "Cobrar");
    assert.equal(t("Release hold"), "Liberar reserva");
    assert.equal(t("__missing_key__"), "__missing_key__");
  });

  it("EN identity leaves keys unchanged", () => {
    const t = agendaI18n("en");
    assert.equal(t("Needs attention"), "Needs attention");
    assert.equal(t("Week"), "Week");
    assert.equal(t("Confirm transfer"), "Confirm transfer");
  });
});
