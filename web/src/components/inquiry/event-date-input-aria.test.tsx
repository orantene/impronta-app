/** TUL-953: the event date input is linked to its inline error (aria-invalid + aria-describedby). */
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
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";
import { EventDateInput } from "./EventDateInput";
/* eslint-enable import/first */

function render(badInput: boolean) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<DashboardLocaleProvider locale="es"><EventDateInput value="" onChange={() => {}} style={{}} /></DashboardLocaleProvider>);
  });
  const input = host.querySelector("input")!;
  Object.defineProperty(input, "validity", { value: { badInput }, configurable: true });
  act(() => { input.dispatchEvent(new dom.window.Event("focusout", { bubbles: true })); });
  const alert = host.querySelector('[role="alert"]');
  const out = {
    invalid: input.getAttribute("aria-invalid"),
    describedby: input.getAttribute("aria-describedby"),
    alertId: alert?.id ?? null,
  };
  act(() => root.unmount());
  host.remove();
  return out;
}

test("TUL-953: a half-typed date marks the input invalid and points it at the inline error", () => {
  const r = render(true);
  assert.equal(r.invalid, "true");
  assert.ok(r.alertId, "the inline error has an id");
  assert.equal(r.describedby, r.alertId);
});

test("TUL-953: a complete or empty date carries no invalid state and no dangling describedby", () => {
  const r = render(false);
  assert.equal(r.invalid, null);
  assert.equal(r.describedby, null);
  assert.equal(r.alertId, null);
});
