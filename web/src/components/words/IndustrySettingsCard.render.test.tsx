/**
 * TUL-1708 follow-up (area E) — IndustrySettingsCard's role gate had no
 * render coverage. Pins three things: (1) with no AdminShellProvider
 * mounted at all, the card fails CLOSED (read-only), not open; (2) an
 * editor sees a disabled preset control and changing it never reaches
 * the mutating server action; (3) an admin's change does reach it.
 *
 * No module-mocking framework exists for this repo's `tsx --test` unit
 * tests on Node 20 (no jest.mock/vi.mock, no node:test mock.module until
 * Node 22). `industrySettingsActions` is a plain mutable object the
 * component calls through for exactly this reason — see its doc comment
 * in IndustrySettingsCard.tsx.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.HTMLSelectElement = dom.window.HTMLSelectElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import { AdminShellContextForTests } from "@/components/admin/shell/internal/state/context";
import { IndustrySettingsCard, industrySettingsActions } from "./IndustrySettingsCard";
/* eslint-enable import/first */

const originalLoad = industrySettingsActions.loadIndustrySettings;
const originalSetPreset = industrySettingsActions.setIndustryPreset;
const originalSetType = industrySettingsActions.setBusinessType;

function restoreActions() {
  industrySettingsActions.loadIndustrySettings = originalLoad;
  industrySettingsActions.setIndustryPreset = originalSetPreset;
  industrySettingsActions.setBusinessType = originalSetType;
}

function fakeCtx(role: "editor" | "admin"): React.ContextType<typeof AdminShellContextForTests> {
  return { state: { role } } as unknown as React.ContextType<typeof AdminShellContextForTests>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountCard(
  ctx: React.ContextType<typeof AdminShellContextForTests> | null,
): Promise<{ host: HTMLElement; root: Root }> {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const card = <IndustrySettingsCard locale="en" />;
  const tree = ctx ? (
    <AdminShellContextForTests.Provider value={ctx}>{card}</AdminShellContextForTests.Provider>
  ) : (
    card
  );
  await act(async () => {
    root.render(tree);
  });
  await flush();
  return { host, root };
}

function unmount(host: HTMLElement, root: Root) {
  act(() => {
    root.unmount();
  });
  host.remove();
}

test("no shell mounted: fails closed — search is disabled and the note explains why", async () => {
  industrySettingsActions.loadIndustrySettings = async () => ({ ok: true, rawPresetId: undefined, businessTypeId: null });
  const { host, root } = await mountCard(null);
  const input = host.querySelector("input") as HTMLInputElement;
  assert.ok(input, "the business-type search input must render");
  assert.equal(input.disabled, true, "with no shell context, the card must be read-only, not editable");
  assert.match(host.textContent ?? "", /Only an admin or owner can change this\./);
  unmount(host, root);
  restoreActions();
});

test("editor role: preset select is disabled and changing it never calls the server action", async () => {
  industrySettingsActions.loadIndustrySettings = async () => ({ ok: true, rawPresetId: undefined, businessTypeId: null });
  let calls = 0;
  industrySettingsActions.setIndustryPreset = async () => {
    calls += 1;
    return { ok: true } as Awaited<ReturnType<typeof originalSetPreset>>;
  };
  const { host, root } = await mountCard(fakeCtx("editor"));
  const select = host.querySelector("select") as HTMLSelectElement;
  assert.ok(select, "the preset select must render");
  assert.equal(select.disabled, true, "an editor must see a disabled preset control");
  const other = Array.from(select.options).find((o) => o.value !== select.value);
  assert.ok(other, "need a second preset option to switch to");
  select.value = other!.value;
  await act(async () => {
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await flush();
  assert.equal(calls, 0, "an editor's change must never reach setIndustryPreset");
  assert.match(host.textContent ?? "", /Only an admin or owner can change this\./);
  unmount(host, root);
  restoreActions();
});

test("admin role: preset select is live and changing it calls the server action", async () => {
  industrySettingsActions.loadIndustrySettings = async () => ({ ok: true, rawPresetId: undefined, businessTypeId: null });
  const calls: unknown[] = [];
  industrySettingsActions.setIndustryPreset = async (input) => {
    calls.push(input);
    return { ok: true } as Awaited<ReturnType<typeof originalSetPreset>>;
  };
  const { host, root } = await mountCard(fakeCtx("admin"));
  const select = host.querySelector("select") as HTMLSelectElement;
  assert.ok(select, "the preset select must render");
  assert.equal(select.disabled, false, "an admin must see a live preset control");
  const other = Array.from(select.options).find((o) => o.value !== select.value);
  assert.ok(other, "need a second preset option to switch to");
  select.value = other!.value;
  await act(async () => {
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await flush();
  assert.equal(calls.length, 1, "an admin's change must reach setIndustryPreset exactly once");
  unmount(host, root);
  restoreActions();
});
