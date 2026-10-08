import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { confirmBookingCopy } from "@/lib/messaging/talent-confirm-booking-copy";

import { TalentConfirmBookingView, type TalentConfirmBookingViewProps } from "./TalentConfirmBookingBar";

const noop = () => undefined;
const base: TalentConfirmBookingViewProps = {
  state: "ready",
  copy: confirmBookingCopy("en"),
  amountLabel: "$1,200.00",
  collect: "full",
  phase: "idle",
  error: null,
  onOpen: noop,
  onConfirm: noop,
  onCancel: noop,
};

const render = (over: Partial<TalentConfirmBookingViewProps>) => renderToStaticMarkup(<TalentConfirmBookingView {...base} {...over} />);

test("hidden renders nothing", () => {
  assert.equal(render({ state: "hidden" }), "");
});

test("ready: one primary button with the spec label (en and es)", () => {
  const en = render({});
  assert.match(en, /data-talent-confirm-booking="ready"/);
  assert.match(en, /data-confirm-booking-open[^>]*>Confirm booking and request payment</);
  const es = render({ copy: confirmBookingCopy("es") });
  assert.match(es, />Confirmar reserva y pedir pago</);
  assert.doesNotMatch(en, /role="dialog"/);
});

test("ready, confirming: the dialog names the amount and offers Confirm / Not now", () => {
  const es = render({ copy: confirmBookingCopy("es"), phase: "confirming" });
  assert.match(es, /role="dialog"/);
  assert.match(es, /Se creará la reserva y se enviará la solicitud de pago al cliente por \$1,200\.00\./);
  assert.match(es, /data-confirm-booking-go[^>]*>Confirmar</);
  assert.match(es, /data-confirm-booking-cancel[^>]*>Ahora no</);
  const en = render({ phase: "confirming" });
  assert.match(en, /The booking will be created and the payment request will be sent to the client for \$1,200\.00\./);
});

test("busy: the confirm button is busy and the cancel is disabled", () => {
  const html = render({ phase: "busy" });
  assert.match(html, /data-confirm-booking-go[^>]*aria-busy="true"|aria-busy="true"[^>]*data-confirm-booking-go/);
  assert.match(html, /disabled=""[^>]*data-confirm-booking-cancel|data-confirm-booking-cancel[^>]*disabled=""/);
});

test("pay in person: the dialog says so and states no amount", () => {
  const html = render({ phase: "confirming", collect: "none", amountLabel: null });
  assert.match(html, /The booking will be created\. The client pays in person\./);
  assert.doesNotMatch(html, /\{amount\}/);
});

test("retry_payment: the button and the dialog say retry, not create", () => {
  const idle = render({ state: "retry_payment" });
  assert.match(idle, /data-talent-confirm-booking="retry_payment"/);
  assert.match(idle, />Retry payment request</);
  const open = render({ state: "retry_payment", phase: "confirming", copy: confirmBookingCopy("es") });
  assert.match(open, /La reserva ya existe\. Se enviará de nuevo la solicitud de pago al cliente por \$1,200\.00\./);
});

test("done: a status line, no button (es and en, with and without an online payment)", () => {
  const es = render({ state: "done", copy: confirmBookingCopy("es") });
  assert.match(es, /data-confirm-booking-done[^>]*>Reserva confirmada · pago solicitado</);
  assert.doesNotMatch(es, /<button/);
  assert.match(render({ state: "done" }), />Booking confirmed · payment requested</);
  assert.match(render({ state: "done", collect: "none" }), />Booking confirmed · the client pays in person</);
});

test("a failed attempt shows its sentence as an alert under the control", () => {
  const html = render({ state: "retry_payment", error: confirmBookingCopy("en").errors.payment_link_failed });
  assert.match(html, /role="alert" data-confirm-booking-error/);
  assert.match(html, /The booking was created, but the payment request failed\. You can retry it\./);
});

test("the bar carries the msgv5 scope (its Btn styles are scoped .msgv5 .btn) and no inline styles", () => {
  const src = readFileSync(new URL("./TalentConfirmBookingBar.tsx", import.meta.url), "utf8");
  assert.equal((src.match(/className="msgv5\b/g) ?? []).length, 2);
  assert.doesNotMatch(src, /style=\{/);
  assert.doesNotMatch(src, /—/);
});
