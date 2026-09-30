/**
 * The "Políticas" link opens the policy in a sheet OVER the booking: the
 * booking's own state survives open and close, nothing navigates, and Escape
 * closes only the policy sheet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://jor.example/reservar",
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MutationObserver = dom.window.MutationObserver;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { PolicyLinkSheet } from "@/components/public-booking/PolicyLinkSheet";
import { buildPolicyPage } from "./public";
/* eslint-enable import/first */

const TALENT = "00000000-0000-4000-8000-0000000000aa";
const ROOT = join(__dirname, "..", "..", "..");

const requested: string[] = [];
g.fetch = async (url: string) => {
  requested.push(String(url));
  return {
    ok: true,
    json: async () => ({ model: buildPolicyPage({ doc: "booking", locale: "es", published: null }) }),
  };
};

/** A stand-in booking: the contact name + chosen option live in ITS state. */
function Booking() {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState("");
  return createElement(
    "div",
    { "data-booking": "" },
    createElement("output", { "data-name": "" }, name),
    createElement("button", { type: "button", "data-fill": "", onClick: () => setName("Valeria") }, "fill"),
    createElement("button", { type: "button", "data-pick": "", onClick: () => setPicked("corte") }, picked || "pick"),
    createElement(PolicyLinkSheet, { talentProfileId: TALENT, locale: "es" }),
  );
}

const tick = () => new Promise((r) => setTimeout(r, 10));

test("the policy sheet opens over the booking and keeps its state", async () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  let windowEscapes = 0;
  const onWindowKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") windowEscapes++;
  };
  dom.window.addEventListener("keydown", onWindowKey);
  const before = dom.window.location.href;

  await act(async () => {
    root.render(createElement(Booking));
  });

  // State the client has already given the booking.
  await act(async () => {
    (host.querySelector("[data-fill]") as HTMLElement).click();
  });
  await act(async () => {
    (host.querySelector("[data-pick]") as HTMLElement).click();
  });
  assert.equal(host.querySelector("[data-name]")?.textContent, "Valeria");
  assert.equal(host.querySelector("[data-pick]")?.textContent, "corte");

  // The link is a button, not an anchor: it cannot navigate.
  const link = host.querySelector("[data-policy-link]") as HTMLElement;
  assert.equal(link.tagName, "BUTTON");
  assert.equal(link.getAttribute("type"), "button");
  assert.equal(link.textContent, "Políticas");
  assert.equal(host.querySelector("a[href]"), null);

  await act(async () => {
    link.click();
    await tick();
  });
  const sheet = dom.window.document.querySelector("[data-policy-sheet]");
  assert.ok(sheet, "the sheet is open, portalled over the booking");
  assert.equal(host.contains(sheet), false, "portalled to body, above the booking's own sheet");
  assert.match(sheet?.textContent ?? "", /Políticas de reserva/);
  assert.equal(requested.length, 1);
  assert.match(requested[0], /^\/api\/public\/talent-policy\?/);
  assert.match(requested[0], new RegExp(`talent=${TALENT}`));

  // Booking state untouched underneath, location unchanged.
  assert.equal(host.querySelector("[data-name]")?.textContent, "Valeria");
  assert.equal(host.querySelector("[data-pick]")?.textContent, "corte");
  assert.equal(dom.window.location.href, before);

  // Escape closes the policy sheet and never reaches the booking's window listener.
  await act(async () => {
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(dom.window.document.querySelector("[data-policy-sheet]"), null);
  assert.equal(windowEscapes, 0);
  assert.equal(host.querySelector("[data-name]")?.textContent, "Valeria");

  // Reopen (no second fetch), then close with the button.
  await act(async () => {
    link.click();
    await tick();
  });
  assert.ok(dom.window.document.querySelector("[data-policy-sheet]"));
  assert.equal(requested.length, 1, "the policy is fetched once per booking sheet");
  await act(async () => {
    (dom.window.document.querySelector("[data-policy-close]") as HTMLElement).click();
  });
  assert.equal(dom.window.document.querySelector("[data-policy-sheet]"), null);
  assert.equal(host.querySelector("[data-name]")?.textContent, "Valeria");
  assert.equal(host.querySelector("[data-pick]")?.textContent, "corte");

  dom.window.removeEventListener("keydown", onWindowKey);
  await act(async () => root.unmount());
});

test("no talent, no link", async () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(PolicyLinkSheet, { talentProfileId: null, locale: "en" }));
  });
  assert.equal(host.querySelector("[data-policy-link]"), null);
  await act(async () => root.unmount());
});

test("the booking sheet, the offering sheet and the purchase sheet all carry the link", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
  for (const rel of [
    "src/components/public-booking/CatalogBookingSheet.tsx",
    "src/components/public-booking/CatalogPurchaseMount.tsx",
    "src/app/t/[profileCode]/_shared/OfferingInstantMount.tsx",
  ]) {
    assert.match(read(rel), /<PolicyLinkSheet talentProfileId=\{d(etail)?\.talentProfileId\}/, rel);
  }
});
