import assert from "node:assert/strict";
import { test } from "node:test";

import { contextPlacement, layoutForWidth, shellClassName, variantForLayout } from "./layout";

test("breakpoints: ≥1280 three columns, 900–1279 two, <900 one", () => {
  assert.equal(layoutForWidth(1440), "three");
  assert.equal(layoutForWidth(1280), "three");
  assert.equal(layoutForWidth(1279), "two");
  assert.equal(layoutForWidth(1194), "two");
  assert.equal(layoutForWidth(1024), "two");
  assert.equal(layoutForWidth(900), "two");
  assert.equal(layoutForWidth(899), "one");
  assert.equal(layoutForWidth(390), "one");
});

test("class output per layout: the grid, .tab, .one with the active pane, the drawer and overlay flags", () => {
  assert.equal(shellClassName({ layout: "three", pane: "inbox", drawerOpen: false, overlay: false }), "msgv5 msgs");
  assert.equal(shellClassName({ layout: "two", pane: "inbox", drawerOpen: false, overlay: false }), "msgv5 msgs tab");
  assert.equal(shellClassName({ layout: "two", pane: "inbox", drawerOpen: true, overlay: true }), "msgv5 msgs tab drawer-open has-overlay");
  assert.equal(shellClassName({ layout: "one", pane: "inbox", drawerOpen: false, overlay: false }), "msgv5 msgs one pane-inbox");
  assert.equal(shellClassName({ layout: "one", pane: "thread", drawerOpen: true, overlay: false }), "msgv5 msgs one pane-thread");
  // The drawer flag never leaks into the three- or one-column class list.
  assert.doesNotMatch(shellClassName({ layout: "three", pane: "inbox", drawerOpen: true, overlay: false }), /drawer/);
});

test("the mobile kit below 900, the desktop grammar above (also at 1194); the context panel is a column, a drawer, then a sheet", () => {
  assert.equal(variantForLayout("three"), "desktop");
  assert.equal(variantForLayout("two"), "desktop");
  assert.equal(variantForLayout("one"), "mobile");
  assert.equal(contextPlacement("three"), "column");
  assert.equal(contextPlacement("two"), "drawer");
  assert.equal(contextPlacement("one"), "sheet");
});
