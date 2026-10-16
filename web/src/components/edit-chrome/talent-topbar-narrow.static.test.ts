import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { unpublishedChangesShort } from "@/lib/talent-site/history/copy";

/** TUL-536: at phone width nothing in the builder top bar may sit over the account chip or ES/EN. */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const TOPBAR = read("./topbar.tsx");
const CHIP = read("./talent-draft-chip.tsx");
const MENU = read("./topbar-overflow.tsx");

test("short draft label is a compact count, no em dash", () => {
  assert.deepEqual(unpublishedChangesShort(1), { en: "1 change", es: "1 cambio" });
  assert.deepEqual(unpublishedChangesShort(3), { en: "3 changes", es: "3 cambios" });
});

test("draft chip swaps to the short label under 640px and keeps the full one for screen readers", () => {
  assert.match(CHIP, /max-\[640px\]:hidden/);
  assert.match(CHIP, /unpublishedChangesShort/);
  assert.match(CHIP, /aria-label=/);
});

test("secondary controls leave the bar on phones and live in the overflow menu", () => {
  assert.match(TOPBAR, /<TopbarOverflowMenu/);
  assert.ok((TOPBAR.match(/max-\[640px\]:hidden/g) ?? []).length >= 3);
  assert.match(MENU, /min-\[641px\]:hidden|sm:hidden|max-\[640px\]:inline-flex/);
  assert.match(MENU, /aria-haspopup="menu"/);
  assert.match(MENU, /role="menuitem"/);
});

test("Publish never pins over the bar on phones", () => {
  assert.match(TOPBAR, /sticky right-\[20px\] z-\[2\] shrink-0 max-\[640px\]:static/);
});
