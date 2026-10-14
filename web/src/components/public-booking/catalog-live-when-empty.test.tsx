/**
 * TUL-681: the live "when" step must never end in "try another day" with
 * nothing to click. Zero slots offers the consult button; no hours says so.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CatalogLiveWhenPicker } from "./CatalogLiveWhenPicker";
import { catalogEmptySlotsCopy } from "./catalog-booking-logic";

function render(props: { es: boolean; days?: Array<{ key: string; date: Date; starts: string[] }>; reason?: string | null; loading?: boolean }) {
  return renderToStaticMarkup(
    createElement(CatalogLiveWhenPicker, {
      es: props.es,
      locale: props.es ? "es" : "en",
      liveDays: props.days ?? [],
      emptyReason: props.reason ?? null,
      loading: props.loading ?? false,
      dayIndex: 0,
      liveStarts: null,
      liveTz: "America/Mexico_City",
      timeGroupLabel: "times",
      emptyConsultButton: createElement("button", { "data-catalog-empty-ask": "" }, props.es ? "Solicitar un horario" : "Request a time"),
      takenNotice: null,
      onPickDay: () => {},
      onPickStart: () => {},
    }),
  );
}

// Catches: QA Free showed "Try another day" with no day picker and no way forward.
test("no slots never says try another day and always offers the request button", () => {
  for (const reason of ["no_booking_hours", "closed_in_window", "fully_booked", "hours_unreadable", null]) {
    for (const es of [true, false]) {
      const html = render({ es, reason });
      assert.doesNotMatch(html, /Try another day|Prueba otra fecha|otra fecha/i, `${reason}/${es}`);
      assert.match(html, /data-catalog-empty-ask/, `${reason}/${es}`);
      assert.doesNotMatch(html, /jb-days/, "no empty date strip");
      assert.doesNotMatch(html, /—/, "no em dash");
    }
  }
});

// Catches: a talent with no hours got the same copy as a full calendar.
test("no hours gets its own ES and EN message", () => {
  assert.match(render({ es: false, reason: "no_booking_hours" }), /No times are published yet/);
  assert.match(render({ es: true, reason: "no_booking_hours" }), /Aún no hay horarios publicados/);
  assert.match(render({ es: false, reason: "fully_booked" }), /Fully booked/);
});

// Catches: empty state flashing while slots are still loading.
test("empty state is hidden while loading", () => {
  assert.doesNotMatch(render({ es: false, loading: true }), /jb-empty/);
});

// Catches: day picker lost when slots exist on later days only.
test("with slots on later days the day picker renders with those days", () => {
  const d = new Date(2026, 9, 20);
  const html = render({ es: false, days: [{ key: "2026-10-20", date: d, starts: ["2026-10-20T16:00:00Z"] }] });
  assert.match(html, /jb-days/);
  assert.match(html, /jb-times/);
});

test("copy helper covers ES and EN without em dashes", () => {
  for (const r of ["no_booking_hours", "fully_booked", "closed_in_window", null]) {
    for (const es of [true, false]) {
      const c = catalogEmptySlotsCopy(r, es, false);
      assert.ok(c.title && c.body && c.cta);
      assert.doesNotMatch(`${c.title}${c.body}${c.cta}`, /—/);
    }
  }
});
