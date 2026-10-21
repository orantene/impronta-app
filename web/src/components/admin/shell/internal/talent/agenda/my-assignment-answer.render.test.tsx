import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MyAssignmentView, type MySeat } from "./MyAssignmentAnswer";

const noop = () => {};
const seat = (status: MySeat["status"]): MySeat => ({ assignmentId: "s1", roleLabel: "Waiter", status });
const html = (s: MySeat, locale: "es" | "en", extra: { busy?: boolean; failed?: boolean } = {}) =>
  renderToStaticMarkup(<MyAssignmentView seat={s} locale={locale} onAnswer={noop} {...extra} />);

test("awaiting: Confirm and Decline in the person's language, with 44px targets and their role", () => {
  const en = html(seat("awaiting"), "en");
  assert.match(en, /Confirm/);
  assert.match(en, /Decline/);
  assert.match(en, /Your role: Waiter/);
  assert.equal((en.match(/min-h-\[44px\]/g) ?? []).length, 2);
  const es = html(seat("awaiting"), "es");
  assert.match(es, /Confirmar/);
  assert.match(es, /Rechazar/);
  assert.match(es, /Tu rol: Waiter/);
});

test("the state is shown, and only the other action is offered", () => {
  const confirmed = html(seat("confirmed"), "en");
  assert.match(confirmed, /You confirmed/);
  assert.ok(!confirmed.includes("data-my-assignment-confirm"));
  assert.ok(confirmed.includes("data-my-assignment-decline"));
  const declined = html(seat("declined"), "es");
  assert.match(declined, /Rechazaste/);
  assert.ok(declined.includes("data-my-assignment-confirm"));
  assert.ok(!declined.includes("data-my-assignment-decline"));
});

test("busy disables the buttons; a failed save says so in plain words; no em dash", () => {
  const busy = html(seat("awaiting"), "en", { busy: true });
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html(seat("awaiting"), "es", { failed: true }), /No se pudo guardar tu respuesta/);
  for (const out of [busy, html(seat("awaiting"), "es", { failed: true })]) assert.ok(!out.includes("—"));
});

test("wiring: the container reads only the signed-in person's seat and answers through the guarded action; the record route renders it", () => {
  const comp = readFileSync(new URL("./MyAssignmentAnswer.tsx", import.meta.url), "utf8");
  assert.match(comp, /readMyAssignmentAction\(\{ bookingId \}\)/);
  assert.match(comp, /answerMyAssignmentAction\(\{ assignmentId: seat\.assignmentId, status \}\)/);
  assert.match(comp, /if \(!seat\) return null;/);
  const route = readFileSync(new URL("./BookingRecordRoute.tsx", import.meta.url), "utf8");
  assert.match(route, /<MyAssignmentAnswer bookingId=\{bookingId\} locale=\{copy\.locale\} \/>/);
  const action = readFileSync(new URL("../../../../../../lib/server-actions/project-assignment-confirmation.ts", import.meta.url), "utf8");
  assert.match(action, /export async function readMyAssignmentAction/);
  assert.match(action, /readOwnSeat\(admin, \{ userId: user\.id/);
});
