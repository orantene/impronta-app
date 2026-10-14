/**
 * TUL-841 / TUL-843 / TUL-845 / TUL-849: guest booking sheet form behaviour.
 * Validate on submit first, then live; focus the first invalid field; reset the
 * selection when the booking is done; never offer a day with no hours.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CatalogBookingSheet } from "./CatalogBookingSheet";
import { firstInvalidWhoField } from "./catalog-booking-validation";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
/* eslint-enable import/first */

function detail(partial: Partial<OfferingRequestDetail> = {}): OfferingRequestDetail {
  return {
    offeringId: "off-1",
    talentProfileId: "talent-1",
    title: "Gel pedicure",
    kind: "service",
    priceType: "flat_package",
    amountCents: 30000,
    currency: "MXN",
    durationMinutes: 75,
    allowPayInPerson: true,
    reserveMode: "free",
    depositPct: null,
    imageUrl: null,
    variants: [],
    addOns: [],
    intent: "instant",
    where: ["client"],
    ...partial,
  };
}

function mount() {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<CatalogBookingSheet locale="es" mode="demo" tenantId={null} />);
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function open(d: OfferingRequestDetail) {
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:offering-instant", { detail: { ...d, startAt: "when" } }));
  });
}

function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: typeof el }) => void }>)[key];
  act(() => {
    setter.call(el, value);
    props.onChange({ target: el });
  });
}

function blur(el: HTMLElement) {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
  const props = (el as unknown as Record<string, { onBlur?: () => void }>)[key];
  act(() => props.onBlur?.());
}

function toWho(host: HTMLElement) {
  act(() => host.querySelector<HTMLButtonElement>(".jb-times .jb-time")!.click());
  act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="when"]')!.click());
}

const q = (host: HTMLElement, id: string) => host.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
const submit = (host: HTMLElement) => act(() => host.querySelector<HTMLButtonElement>('[data-catalog-continue="who"]')!.click());

test("firstInvalidWhoField follows page order", () => {
  const ok = { nameValid: true, phoneValid: true, emailValid: true, addressValid: true };
  assert.equal(firstInvalidWhoField(ok), null);
  assert.equal(firstInvalidWhoField({ ...ok, addressValid: false }), "cb-service-address");
  assert.equal(firstInvalidWhoField({ ...ok, emailValid: false, addressValid: false }), "cb-email");
  assert.equal(firstInvalidWhoField({ ...ok, nameValid: false, phoneValid: false }), "cb-name");
});

test("TUL-843: blurring an empty field shows no error before the guest submits", () => {
  const { host, unmount } = mount();
  open(detail());
  toWho(host);
  blur(q(host, "cb-name"));
  blur(q(host, "cb-email"));
  assert.equal(host.querySelector('[data-testid="cb-name"] ~ em'), null, "no name error on blur");
  assert.doesNotMatch(host.textContent ?? "", /Escribe tu nombre|correo válido/);
  unmount();
});

test("TUL-841/843: submit with an empty address below the fold focuses it, shows an inline alert, then validates live", () => {
  const { host, unmount } = mount();
  open(detail());
  toWho(host);
  typeInto(q(host, "cb-name"), "Vale Demo");
  typeInto(q(host, "cb-email"), "vale@example.com");
  submit(host);
  assert.equal(dom.window.document.activeElement, q(host, "cb-service-address"), "focus lands on the address");
  const alert = host.querySelector('[data-testid="cb-service-address-error"]');
  assert.ok(alert, "inline address error is shown");
  assert.equal(alert.getAttribute("role"), "alert");
  assert.ok(host.querySelector(".jb-done") === null, "nothing was booked");
  // After the first attempt errors are live: breaking the name now shows its error without another submit.
  typeInto(q(host, "cb-name"), "V");
  assert.match(host.textContent ?? "", /Escribe tu nombre/);
  assert.equal(host.querySelector('[data-testid="cb-name"] ~ em')?.getAttribute("role"), "alert");
  unmount();
});

test("TUL-841: submit with an empty name focuses the name first", () => {
  const { host, unmount } = mount();
  open(detail());
  toWho(host);
  submit(host);
  assert.equal(dom.window.document.activeElement, q(host, "cb-name"));
  unmount();
});
