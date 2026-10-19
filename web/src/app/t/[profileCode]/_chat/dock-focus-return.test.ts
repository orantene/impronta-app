import { test } from "node:test";
import assert from "node:assert/strict";

import { pickFocusReturnTarget, type FocusableLike } from "./dock-focus-return";

const el = (name: string, connected = true): FocusableLike & { name: string } => ({ name, isConnected: connected, focus: () => undefined });

test("TUL-1082: the control that opened the dock gets focus back when it is still reachable", () => {
  const opener = el("cb-bar-chat");
  const pill = el("pill");
  assert.equal(pickFocusReturnTarget([opener, pill], () => true)?.name, "cb-bar-chat");
});

test("TUL-1082: a hidden launcher is skipped (focus does not fall onto 'Continuar')", () => {
  const pill = el("pill");
  const barChat = el("cb-bar-chat");
  const reachable = (e: { name: string }) => e.name !== "pill";
  assert.equal(pickFocusReturnTarget([null, pill, barChat], reachable)?.name, "cb-bar-chat");
});

test("TUL-1082: an unmounted opener (the pill that unmounted while the dock was open) is skipped", () => {
  const gone = el("old-pill", false);
  const fresh = el("pill");
  assert.equal(pickFocusReturnTarget([gone, fresh], () => true)?.name, "pill");
});

test("TUL-1082: nothing reachable returns null instead of throwing", () => {
  assert.equal(pickFocusReturnTarget([null, undefined, el("x", false)], () => true), null);
  assert.equal(pickFocusReturnTarget([], () => true), null);
});
