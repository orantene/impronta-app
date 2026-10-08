import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertDashboardTarget,
  assertNoForbiddenTalent,
  assertReadOnlyAction,
  attentionEmptyVerdict,
  clockAndDateVerdict,
  find24hTimes,
  findAmPmTimes,
  findDdMmWitnesses,
  findNonDdMmDates,
  hasLibraryErrorCard,
  libraryResponseVerdict,
  loadMoreVerdict,
  skipLinkTextFor,
  skipLinkVerdict,
} from "./dashboard-cards";

test("the target guard accepts only TAL-93900 and refuses Jorgelina", () => {
  assertDashboardTarget("TAL-93900");
  for (const bad of ["TAL-93938", "tal-93938", "TAL-1", ""]) assert.throws(() => assertDashboardTarget(bad), /REFUSED/);
  assert.throws(() => assertNoForbiddenTalent("Perfil TAL-93938 listo"), /REFUSED/);
  assertNoForbiddenTalent("Perfil TAL-93900 listo");
});

test("writing actions are refused, reading actions pass", () => {
  for (const bad of ["Save changes", "Publish service", "Guardar cambios", "Delete", "Submit", "Eliminar", "Send quote"]) {
    assert.throws(() => assertReadOnlyAction(bad), /REFUSED/, bad);
  }
  for (const ok of ["Open hours", "Add item", "Cancel", "Load more", "Continuar", "Agregar"]) assert.equal(assertReadOnlyAction(ok), ok);
});

test("12-hour readings are found, 24h readings are not flagged", () => {
  assert.deepEqual(findAmPmTimes("Cita 3:30 PM y 10 am y 9:05 p. m."), ["3:30 PM", "10 am", "9:05 p. m."]);
  assert.deepEqual(findAmPmTimes("Cita 15:30, 08:00 - 18:00, 24 clientes"), []);
  assert.equal(find24hTimes("08:00 - 18:30 y 3:30 PM").length, 2);
});

test("dd/mm: month-in-first-slot dates fail, day-first and ambiguous dates pass", () => {
  assert.deepEqual(findNonDdMmDates("vence 10/25/2026 y 12/31"), ["10/25/2026", "12/31"]);
  assert.deepEqual(findNonDdMmDates("vence 25/10/2026, 03/04 y 1/2 de 24/7"), []);
  assert.deepEqual(findDdMmWitnesses("25/10/2026 y 03/04"), ["25/10/2026"]);
  assert.equal(findNonDdMmDates("https://x/10/25/12").length, 0);
});

test("clockAndDateVerdict fails on AM/PM or mm/dd and passes a Spanish agenda", () => {
  assert.equal(clockAndDateVerdict("Hoy 09:00 Corte  25/10/2026").ok, true);
  assert.equal(clockAndDateVerdict("Hoy 9:00 AM Corte").ok, false);
  assert.equal(clockAndDateVerdict("Vence 10/25/2026").ok, false);
  assert.equal(clockAndDateVerdict("Hoy 09:00 y 18:30").times24h, 2);
});

test("skip link: exactly one, localized, in-page anchor", () => {
  assert.equal(skipLinkTextFor("es"), "Saltar al contenido principal");
  assert.equal(skipLinkTextFor("es-MX"), "Saltar al contenido principal");
  assert.equal(skipLinkTextFor("en"), "Skip to main content");
  const one = [{ text: "Saltar al contenido principal", href: "#tulala-talent-content" }, { text: "Mensajes", href: "/talent/messages" }];
  assert.equal(skipLinkVerdict(one, "es").ok, true);
  assert.equal(skipLinkVerdict([...one, { text: "Saltar al contenido principal", href: "#x" }], "es").ok, false);
  assert.equal(skipLinkVerdict([], "es").ok, false);
  assert.equal(skipLinkVerdict([{ text: "Skip to main content", href: "#a" }], "es").ok, false);
  assert.equal(skipLinkVerdict([{ text: "Saltar al contenido principal", href: "/x" }], "es").ok, false);
});

test("load more must append", () => {
  assert.equal(loadMoreVerdict(24, 48).ok, true);
  assert.equal(loadMoreVerdict(24, 24).ok, false);
  assert.equal(loadMoreVerdict(24, 10).ok, false);
});

test("media library response and error card", () => {
  assert.equal(libraryResponseVerdict({ status: 200, contentType: "application/json" }).ok, true);
  assert.equal(libraryResponseVerdict({ status: 200, contentType: null }).ok, true);
  assert.equal(libraryResponseVerdict({ status: 500, contentType: "application/json" }).ok, false);
  assert.equal(libraryResponseVerdict({ status: 404, contentType: "text/html" }).ok, false);
  assert.equal(hasLibraryErrorCard("No se pudo cargar la biblioteca de medios"), true);
  assert.equal(hasLibraryErrorCard("Could not load the media library"), true);
  assert.equal(hasLibraryErrorCard("Biblioteca 12 archivos"), false);
});

test("empty Today attention card must show its copy", () => {
  assert.equal(attentionEmptyVerdict("Requiere atención Todo al día por ahora.", "es").ok, true);
  assert.equal(attentionEmptyVerdict("Requiere atención Todo al día por ahora.", "es").state, "empty");
  assert.equal(attentionEmptyVerdict("Requiere atención", "es").ok, false);
  assert.equal(attentionEmptyVerdict("Requiere atención 2 Responder", "es").state, "populated");
  assert.equal(attentionEmptyVerdict("Needs attention You are clear for now.", "en").ok, true);
});
