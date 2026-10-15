/** TUL-953: a half-typed event date (02/08/yyyy) shows an inline error on blur, in ES and EN. */
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

function blurWith(locale: "es" | "en", badInput: boolean): string | null {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<DashboardLocaleProvider locale={locale}><EventDateInput value="" onChange={() => {}} style={{}} /></DashboardLocaleProvider>);
  });
  const input = host.querySelector("input")!;
  Object.defineProperty(input, "validity", { value: { badInput }, configurable: true });
  act(() => { input.dispatchEvent(new dom.window.Event("focusout", { bubbles: true })); });
  const text = host.querySelector('[role="alert"]')?.textContent ?? null;
  act(() => root.unmount());
  host.remove();
  return text;
}

test("TUL-953: half-typed date shows the Spanish inline error after blur", () => {
  assert.equal(blurWith("es", true), "Escribe la fecha completa (día, mes y año).");
});

test("TUL-953: half-typed date shows the English inline error after blur", () => {
  assert.equal(blurWith("en", true), "Please enter the full date (day, month and year).");
});

test("TUL-953: a complete or empty date shows no error", () => {
  assert.equal(blurWith("en", false), null);
});
