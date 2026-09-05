/**
 * PurchaseSheet — driven on a REAL React commit cycle (jsdom + react-dom/client).
 *
 * This is the panel a customer touches, and it is the part of the Front Door
 * where "I have not clicked it" would otherwise have to be said. These tests
 * click it. What they cannot do is prove it LOOKS right on a phone, so the
 * visual half stays on the phase-boundary QA list rather than being implied
 * green by this file.
 *
 * HARNESS LIMIT, STATED RATHER THAN WORKED AROUND: React 19 controlled inputs
 * do not receive `onChange` under this jsdom setup. Clicks delegate correctly,
 * keystrokes do not — verified with a trivial two-line probe component, so it
 * is the harness and not this panel. Nothing here fakes typing. The gate a
 * typed email satisfies is proven directly in `sheet-steps.test.ts` ("a guest
 * needs a usable email"), and what this file proves is that the panel HONOURS
 * that gate: a guest standing on the who step with no email cannot continue.
 * The keystroke itself is a phase-boundary QA row, not a silent gap.
 *
 * The component owns no rules. Every assertion here is about WIRING: that the
 * panel asks `sheet-steps` and shows what it answered. Where a rule itself is
 * under test, that lives in `sheet-steps.test.ts`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

// ── jsdom globals BEFORE react-dom/client touches document ──────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MutationObserver = dom.window.MutationObserver;
g.CustomEvent = dom.window.CustomEvent;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act } from "react";
import { createRoot } from "react-dom/client";

import { PurchaseSheet, type SheetLine } from "./PurchaseSheet";
import type { SheetPolicy } from "@/lib/cart/sheet-steps";
/* eslint-enable import/first */

const UNTIMED: SheetPolicy = {
  needsWhen: false,
  requireAccount: false,
  allowPayInPerson: false,
  depositPct: null,
  captchaRequired: false,
};

const LINES: SheetLine[] = [
  { id: "a", title: "Tacos al pastor", unitCents: 12_000, units: 2 },
  { id: "b", title: "Agua fresca", unitCents: 3_500, units: 1 },
];

function mount(ui: React.ReactElement) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    text: () => host.textContent ?? "",
    click: (label: string) => {
      const button = Array.from(host.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes(label),
      );
      assert.ok(button, `no button matching ${label}: ${host.textContent}`);
      act(() => button!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    },
    unmount: () => act(() => root.unmount()),
  };
}

const NOUNS = { item: "Item", items: "Items" };

test("a guest is stopped at the who step with no email", () => {
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={UNTIMED}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn={false}
      onSubmit={async () => null}
    />,
  );

  // Step one shows the order and the real total: 2 x 120.00 + 35.00.
  assert.match(ui.text(), /Your order/);
  assert.match(ui.text(), /\$275\.00/);
  // Three steps a customer walks; "done" is an outcome, not a step.
  assert.match(ui.text(), /Step 1 of 3/);

  ui.click("Continue");
  assert.match(ui.text(), /Who/, "should reach the who step");
  assert.ok(ui.host.querySelector('input[type="email"]'), "a guest must be asked");

  const cont = Array.from(ui.host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Continue"),
  );
  assert.equal(cont?.disabled, true, "continue must be disabled with no email");
  ui.unmount();
});

test("a signed-in customer can walk lines -> who -> pay and confirm", async () => {
  let submitted = false;
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={UNTIMED}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn
      onSubmit={async () => {
        submitted = true;
        return null;
      }}
    />,
  );

  ui.click("Continue");
  assert.match(ui.text(), /Who/);
  assert.match(ui.text(), /You are signed in/, "must not ask a signed-in customer to retype");
  ui.click("Continue");
  assert.match(ui.text(), /Payment/);

  // Nothing is submittable until a payment choice exists.
  const confirm = Array.from(ui.host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Confirm"),
  );
  assert.equal(confirm?.disabled, true, "confirm must be disabled with no choice");

  const radio = ui.host.querySelector<HTMLInputElement>('input[type="radio"]');
  act(() => radio!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  ui.click("Confirm");
  await act(async () => {});

  assert.equal(submitted, true, "onSubmit must have been called");
  assert.match(ui.text(), /Confirmed/);
  ui.unmount();
});

test("a refusal is shown where the customer is standing, not back at step one", async () => {
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={UNTIMED}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn
      onSubmit={async () => "sold_out"}
    />,
  );
  ui.click("Continue"); // lines -> who (signed in, so it passes immediately)
  ui.click("Continue"); // who -> pay
  const radio = ui.host.querySelector<HTMLInputElement>('input[type="radio"]');
  act(() => radio!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  ui.click("Confirm");
  await act(async () => {});

  // Still on pay, with the refusal in an alert. Sending them back to step one
  // to retype everything is how a recoverable refusal becomes an abandonment.
  assert.match(ui.text(), /Payment/);
  const alert = ui.host.querySelector('[role="alert"]');
  assert.ok(alert, "a refusal must be announced, not just styled");
  assert.ok((alert!.textContent ?? "").length > 0);
  ui.unmount();
});

test("an unknown refusal code still reads as a sentence", async () => {
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={UNTIMED}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn
      onSubmit={async () => "a_code_nobody_has_written_yet"}
    />,
  );
  ui.click("Continue");
  ui.click("Continue");
  const radio = ui.host.querySelector<HTMLInputElement>('input[type="radio"]');
  act(() => radio!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  ui.click("Confirm");
  await act(async () => {});
  const alert = ui.host.querySelector('[role="alert"]');
  assert.ok((alert?.textContent ?? "").trim().length > 10, "must not be blank");
  ui.unmount();
});

test("the panel speaks Spanish, and formats money for es-MX", () => {
  const ui = mount(
    <PurchaseSheet
      locale="es"
      policy={UNTIMED}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn={false}
      onSubmit={async () => null}
    />,
  );
  assert.match(ui.text(), /Tu pedido/);
  assert.match(ui.text(), /Paso 1 de 3/);
  assert.doesNotMatch(ui.text(), /Your order/);
  // es-MX renders USD as "USD 275.00" rather than "$275.00". Asserted so that a
  // later switch to a bare "$" is a failing test and not a silent ambiguity in
  // a country whose own currency also uses that sign.
  assert.match(ui.text(), /USD\s?275\.00/);
  ui.unmount();
});

test("ask-first is offered at step one, with lines and nothing else", () => {
  let asked = false;
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={UNTIMED}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn={false}
      onSubmit={async () => null}
      onAskFirst={() => {
        asked = true;
      }}
    />,
  );
  ui.click("Ask a question first");
  assert.equal(asked, true, "the storefront-to-chat handoff must work with no email");
  ui.unmount();
});

test("an empty cart offers no way forward and no way to ask", () => {
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={UNTIMED}
      lines={[]}
      currency="USD"
      nouns={NOUNS}
      signedIn={false}
      onSubmit={async () => null}
      onAskFirst={() => {}}
    />,
  );
  assert.match(ui.text(), /Nothing here yet/);
  const cont = Array.from(ui.host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Continue"),
  );
  assert.equal(cont?.disabled, true);
  assert.doesNotMatch(ui.text(), /Ask a question first/);
  ui.unmount();
});

test("a deposit policy charges the deposit now, not the total", () => {
  const ui = mount(
    <PurchaseSheet
      locale="en"
      policy={{ ...UNTIMED, depositPct: 25 }}
      lines={LINES}
      currency="USD"
      nouns={NOUNS}
      signedIn
      onSubmit={async () => null}
    />,
  );
  ui.click("Continue");
  ui.click("Continue");
  // Deposit is offered first when the policy has one.
  const radio = ui.host.querySelector<HTMLInputElement>('input[type="radio"]');
  act(() => radio!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  // 25% of 275.00.
  assert.match(ui.text(), /\$68\.75/, `due now was wrong: ${ui.text()}`);
  ui.unmount();
});
