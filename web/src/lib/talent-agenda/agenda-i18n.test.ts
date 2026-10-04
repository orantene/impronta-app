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
    assert.equal(t("View all"), "Ver todo");
    assert.equal(t("On hold"), "En hold");
    assert.equal(t("Deposit paid"), "Depósito pagado");
    assert.equal(t("Hold expired"), "Hold vencido");
    assert.equal(t("Not requested"), "Sin solicitud");
    assert.equal(t("Checking payment"), "Verificando pago");
    assert.equal(t("__missing_key__"), "__missing_key__");
  });

  it("EN identity leaves keys unchanged", () => {
    const t = agendaI18n("en");
    assert.equal(t("Needs attention"), "Needs attention");
    assert.equal(t("Week"), "Week");
    assert.equal(t("Confirm transfer"), "Confirm transfer");
  });

  it("AUD-031/032: chip nouns and agency complete copy have ES", () => {
    const t = agendaI18n("es");
    assert.equal(t("Booking requested"), "Reserva solicitada");
    assert.equal(t("Deposit not requested"), "Depósito sin solicitar");
    assert.equal(
      t("This booking is confirmed. The agency marks it complete."),
      "Esta reserva está confirmada. La agencia la marca como completa.",
    );
    assert.equal(t("At your studio"), "En tu estudio");
  });

  it("Track D5: Sin hora strip labels have ES", () => {
    const t = agendaI18n("es");
    assert.equal(t("No time"), "Sin hora");
    assert.equal(t("Set a time"), "Asignar hora");
    assert.equal(t("No time assigned"), "Sin hora asignada");
  });
});
