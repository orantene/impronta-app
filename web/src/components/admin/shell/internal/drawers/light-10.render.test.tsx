/**
 * TUL-1708 follow-up (area E) — FieldCatalogDrawer's and FieldPrivacyDrawer's
 * role gate (`canManage`) had no render coverage. Both drawers only disable
 * their mutating controls by PLAN tier (`canCustomize`/`canFlipPublicInternal`
 * etc.) — the role check lives INSIDE each handler, so the button itself
 * stays clickable for an editor on a high-enough plan. These tests prove the
 * handler-level gate actually stops the server-action call for an editor,
 * and lets it through for an admin.
 *
 * No module-mocking framework exists for this repo's `tsx --test` unit
 * tests on Node 20 (no jest.mock/vi.mock, no node:test mock.module until
 * Node 22). `fieldCatalogActions`/`fieldPrivacyActions` are plain mutable
 * objects the drawers call through for exactly this reason — see their doc
 * comment in light-10.tsx.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLButtonElement = dom.window.HTMLButtonElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.IS_REACT_ACT_ENVIRONMENT = true;
// DrawerShell's focus-management effect schedules work via rAF; jsdom has
// no animation frame loop, so provide a synchronous-ish stand-in.
g.requestAnimationFrame = (cb: (t: number) => void) => dom.window.setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import { AdminShellContextForTests } from "@/components/admin/shell/internal/state/context";
import { FieldCatalogDrawer, fieldCatalogActions } from "./light-10";
import { FieldPrivacyDrawer, fieldPrivacyActions } from "./field-privacy-drawer";
/* eslint-enable import/first */

const originalGetCatalog = fieldCatalogActions.getWorkspaceFieldCatalog;
const originalSetCatalog = fieldCatalogActions.setWorkspaceFieldCatalog;
const originalGetPrivacy = fieldPrivacyActions.getFieldPrivacyCatalog;
const originalSetVisibility = fieldPrivacyActions.setWorkspaceFieldVisibility;

function restoreActions() {
  fieldCatalogActions.getWorkspaceFieldCatalog = originalGetCatalog;
  fieldCatalogActions.setWorkspaceFieldCatalog = originalSetCatalog;
  fieldPrivacyActions.getFieldPrivacyCatalog = originalGetPrivacy;
  fieldPrivacyActions.setWorkspaceFieldVisibility = originalSetVisibility;
}

// plan "agency" clears every plan-tier gate (FIELD_PRIVACY_PLAN_RULES), so
// the only thing left disabling/stopping a click is the role gate itself.
function fakeCtx(
  role: "editor" | "admin",
  toast: (msg: string) => void,
): React.ContextType<typeof AdminShellContextForTests> {
  return {
    state: { plan: "agency", role, drawer: { drawerId: "field-catalog" } },
    closeDrawer: () => {},
    openDrawer: () => {},
    toast,
    // DrawerShell (rendered by both drawers) reads these directly: the
    // back-stack "← Back" affordance and the help-panel lookup.
    drawerStack: [],
  } as unknown as React.ContextType<typeof AdminShellContextForTests>;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(
  ui: React.ReactElement,
  ctx: React.ContextType<typeof AdminShellContextForTests>,
): Promise<{ host: HTMLElement; root: Root }> {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<AdminShellContextForTests.Provider value={ctx}>{ui}</AdminShellContextForTests.Provider>);
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

function findButtonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));
  assert.ok(button, `expected a button containing "${text}"`);
  return button as HTMLButtonElement;
}

test("FieldCatalogDrawer — editor role: clicking the field toggle never calls the server action", async () => {
  fieldCatalogActions.getWorkspaceFieldCatalog = async () => ({
    ok: true,
    groups: [],
    fields: [
      {
        field_definition_id: "f1",
        field_key: "nickname",
        label: "Nickname",
        field_group_id: null,
        display_order: 10,
        enabled: true,
        required_override: false,
        custom_label: null,
        custom_helper: null,
      },
    ],
  });
  let calls = 0;
  fieldCatalogActions.setWorkspaceFieldCatalog = async () => {
    calls += 1;
    return { ok: true } as Awaited<ReturnType<typeof originalSetCatalog>>;
  };
  const toasts: string[] = [];
  const { host, root } = await mount(<FieldCatalogDrawer />, fakeCtx("editor", (m) => toasts.push(m)));
  const onButton = findButtonByText(host, "On");
  assert.equal(onButton.disabled, false, "plan tier (agency) must not disable this control — only the role gate does");
  await act(async () => {
    onButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.equal(calls, 0, "an editor's click must never reach setWorkspaceFieldCatalog");
  assert.ok(toasts.length > 0, "an editor's click must surface the role-gate notice");
  unmount(host, root);
  restoreActions();
});

test("FieldCatalogDrawer — admin role: clicking the field toggle calls the server action", async () => {
  fieldCatalogActions.getWorkspaceFieldCatalog = async () => ({
    ok: true,
    groups: [],
    fields: [
      {
        field_definition_id: "f1",
        field_key: "nickname",
        label: "Nickname",
        field_group_id: null,
        display_order: 10,
        enabled: true,
        required_override: false,
        custom_label: null,
        custom_helper: null,
      },
    ],
  });
  const calls: unknown[] = [];
  fieldCatalogActions.setWorkspaceFieldCatalog = async (input) => {
    calls.push(input);
    return { ok: true } as Awaited<ReturnType<typeof originalSetCatalog>>;
  };
  const { host, root } = await mount(<FieldCatalogDrawer />, fakeCtx("admin", () => {}));
  const onButton = findButtonByText(host, "On");
  assert.equal(onButton.disabled, false);
  await act(async () => {
    onButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.equal(calls.length, 1, "an admin's click must reach setWorkspaceFieldCatalog exactly once");
  unmount(host, root);
  restoreActions();
});

test("FieldPrivacyDrawer — editor role: clicking a visibility option never calls the server action", async () => {
  fieldPrivacyActions.getFieldPrivacyCatalog = async () => ({
    ok: true,
    groups: [],
    fields: [
      {
        field_definition_id: "f1",
        field_key: "nickname",
        label: "Nickname",
        field_group_id: null,
        display_order: 10,
        effective: "public",
        platform_default: "public",
        floored: false,
        has_override: false,
      },
    ],
  });
  let calls = 0;
  fieldPrivacyActions.setWorkspaceFieldVisibility = async () => {
    calls += 1;
    return { ok: true } as Awaited<ReturnType<typeof originalSetVisibility>>;
  };
  const toasts: string[] = [];
  const { host, root } = await mount(<FieldPrivacyDrawer />, fakeCtx("editor", (m) => toasts.push(m)));
  const adminButton = findButtonByText(host, "Admin");
  assert.equal(adminButton.disabled, false, "plan tier (agency) must not disable this control — only the role gate does");
  await act(async () => {
    adminButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.equal(calls, 0, "an editor's click must never reach setWorkspaceFieldVisibility");
  assert.ok(toasts.length > 0, "an editor's click must surface the role-gate notice");
  unmount(host, root);
  restoreActions();
});

test("FieldPrivacyDrawer — admin role: clicking a visibility option calls the server action", async () => {
  fieldPrivacyActions.getFieldPrivacyCatalog = async () => ({
    ok: true,
    groups: [],
    fields: [
      {
        field_definition_id: "f1",
        field_key: "nickname",
        label: "Nickname",
        field_group_id: null,
        display_order: 10,
        effective: "public",
        platform_default: "public",
        floored: false,
        has_override: false,
      },
    ],
  });
  const calls: unknown[] = [];
  fieldPrivacyActions.setWorkspaceFieldVisibility = async (input) => {
    calls.push(input);
    return { ok: true } as Awaited<ReturnType<typeof originalSetVisibility>>;
  };
  const { host, root } = await mount(<FieldPrivacyDrawer />, fakeCtx("admin", () => {}));
  const adminButton = findButtonByText(host, "Admin");
  assert.equal(adminButton.disabled, false);
  await act(async () => {
    adminButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.equal(calls.length, 1, "an admin's click must reach setWorkspaceFieldVisibility exactly once");
  unmount(host, root);
  restoreActions();
});
