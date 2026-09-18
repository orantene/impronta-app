import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AppointmentCard } from "./AppointmentCard";
import { EN_COPY } from "./test-copy";

const base = { title: "AP-2041", clientName: "Carla Méndez", withName: "Dani", copy: EN_COPY, onAction: () => {} };

test("confirmed with deposit: pill, who, lines, balance on the day, Reschedule", () => {
  const html = renderToStaticMarkup(<AppointmentCard {...base} state="confirmed" paymentState="deposit_paid" lines={[{ label: "Balayage · 2h 30m · Dani", value: "Sat Sep 19 · 11:00" }, { label: "Chair 3 · Basin 1 reserved", muted: true }]} balanceLabel="$140" />);
  assert.match(html, /card k-appt me/);
  assert.match(html, /class="cat">Appointment</);
  assert.match(html, /pill money">Deposit paid/);
  assert.match(html, /Carla Méndez · with Dani/);
  assert.match(html, /Balance \$140 on the day/);
  assert.match(html, /data-appt-action[^>]*>Reschedule/);
});

test("confirming (busy) shows the recheck ladder; conflict lists S3 conflicts and says nothing was created", () => {
  const busy = renderToStaticMarkup(<AppointmentCard {...base} state="confirming" isProject ladder={[{ label: "Sofía Aug 14 to 15", done: true }, { label: "Dani Aug 14 to 15", done: true }, { label: "Sound system", done: false }, { label: "Create project", done: false }]} />);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /class="ttl">Confirming</);
  assert.match(busy, /rechecking availability/);
  assert.match(busy, /class="cat">Booking</);
  const conflict = renderToStaticMarkup(<AppointmentCard {...base} state="conflict" conflicts={[{ line: "Ana · hostess", why: "Ana is no longer free on 2026-09-20", at: "2026-09-20T19:00:00Z", code: "person_busy" }]} />);
  assert.match(conflict, /pill fail">Conflict/);
  assert.match(conflict, /Ana · hostess/);
  assert.match(conflict, /Ana is no longer free on 2026-09-20/);
  assert.match(conflict, /Nothing was created\. Fix the line and confirm again\./);
});

test("cancelled by client: lost pill, free-again sentence, no action; hold: due pill", () => {
  const html = renderToStaticMarkup(<AppointmentCard {...base} state="cancelled" freeAgain="Chair 3 and Dani" />);
  assert.match(html, /pill lost">Cancelled by client/);
  assert.match(html, /Chair 3 and Dani free again · Calendar updated/);
  assert.doesNotMatch(html, /data-appt-action/);
  assert.match(renderToStaticMarkup(<AppointmentCard {...base} state="hold" />), /pill due">Held/);
  assert.match(renderToStaticMarkup(<AppointmentCard {...base} state="confirmed" isProject variant="mobile" />), /mx-card k-appt/);
});
