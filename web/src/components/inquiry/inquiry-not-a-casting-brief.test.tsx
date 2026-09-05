/**
 * A business tenant's inquiry drawer is NOT a casting brief.
 *
 * Measured on El Paisa in production: a diner who clicked "Reserve" was shown
 * "Start a new project — we'll match talent and draft an offer", and asked for
 * a "Job name", the "end client", "how many talent", "type of talent", and what
 * "talent brings" versus what the client provides.
 *
 * 38 of `public.inquiryDrawer`'s 194 strings are casting-shaped. The ruling was
 * that rewording them is not the fix: a diner does not need "how many talent"
 * phrased better, they need it ABSENT. So the Talent and per-talent Budget
 * sections are not rendered at all when the workspace represents nobody.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";

import { ClientSection } from "./InquiryDrawer";
/* eslint-enable import/first */

const HERE = dirname(fileURLToPath(import.meta.url));

function render(node: React.ReactElement): string {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  const text = host.textContent ?? "";
  act(() => root.unmount());
  return text;
}

test("a business tenant is never asked for a Job name", () => {
  const text = render(
    <ClientSection
      representsPeople={false}
      requester={{}}
      value={{ same_as_requester: false }}
      onChange={() => {}}
    />,
  );
  assert.doesNotMatch(text, /Job name/i, `a diner was asked for a job name: ${text}`);
});

test("but an agency still is — this did not just delete a field", () => {
  // The mirror of the first test. The gate must remove the field for a
  // restaurant WITHOUT removing it from the workspaces it was built for.
  const text = render(
    <ClientSection
      representsPeople
      requester={{}}
      value={{ same_as_requester: false }}
      onChange={() => {}}
    />,
  );
  assert.match(text, /Job name/i);
});

test("the default is the agency behaviour, so an existing caller is unchanged", () => {
  // `representsPeople` is optional. Every mount that predates it — the agency
  // workspace, the client area — must behave exactly as it did.
  const text = render(
    <ClientSection requester={{}} value={{ same_as_requester: false }} onChange={() => {}} />,
  );
  assert.match(text, /Job name/i);
});

test("Talent and per-talent Budget are gated at the parent, not reworded", () => {
  // Those two sections are rendered by `Compose`, which is not exported, so
  // this pins the gate at source. Asserted on the SHAPE — that each render
  // sits inside a `representsPeople` conditional — rather than on exact
  // formatting, so a prettier run cannot redden it.
  const src = readFileSync(join(HERE, "InquiryDrawer.tsx"), "utf8");
  for (const section of ["TalentSection", "BudgetSection"]) {
    const at = src.indexOf(`<${section}`);
    assert.ok(at > 0, `${section} is not rendered any more`);
    const before = src.slice(Math.max(0, at - 260), at);
    assert.ok(
      /representsPeople\s*\?/.test(before),
      `${section} is rendered without a representsPeople gate, so a business tenant still meets it`,
    );
  }
});
