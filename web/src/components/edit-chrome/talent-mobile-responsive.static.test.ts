import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * Pins the 375px rules for the talent builder chrome and the theme-update UX.
 * Static: reads the sources, so a refactor cannot silently drop a phone rule.
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const CHIP = read("./talent-draft-chip.tsx");
const HISTORY = read("./talent-history-list.tsx");
const DRAWER = read("./kit/drawer.tsx");
const SHELL = read("./kit/floating-panel-shell.tsx");
const SHEET = read("../talent/site/theme-update/ThemeUpdateSheet.tsx");
const NOTICE = read("../talent/site/theme-update/ThemeUpdateNotice.tsx");

test("What will go live becomes a bottom sheet under sm, side panel from sm", () => {
  assert.match(CHIP, /items-end justify-center[^"]*sm:items-stretch sm:justify-end/);
  assert.match(CHIP, /max-h-\[88dvh\][^"]*rounded-t-2xl/);
  assert.match(CHIP, /env\(safe-area-inset-bottom\)/);
  assert.match(CHIP, /sm:w-\[min\(420px,100vw\)\]/);
});

test("Draft chip and sheet close have a 44px target on phones", () => {
  assert.equal((CHIP.match(/min-h-11 sm:min-h-\[26px\]/g) ?? []).length, 2);
  assert.match(CHIP, /min-h-11 min-w-11 sm:min-h-0 sm:min-w-0/);
});

test("History actions are 44px on phones and never under 12px", () => {
  assert.match(HISTORY, /HIST_BTN = "min-h-11 sm:min-h-6"/);
  assert.doesNotMatch(HISTORY, /fontSize: (?:9|10|11)(?:\.\d)?[,\s}]/);
  assert.doesNotMatch(CHIP, /fontSize: (?:9|10|11)(?:\.\d)?[,\s}]/);
});

test("Every floating drawer is a bottom sheet below md and never wider than the screen", () => {
  assert.match(DRAWER, /compactBottomSheetBelowLg = floating/);
  assert.match(DRAWER, /max-w-full[^`]*max-sm:!w-full/);
  assert.match(SHELL, /max-md:pb-\[env\(safe-area-inset-bottom\)\]/);
});

test("Theme update sheet: bottom sheet under sm, dvh height, safe-area footer, 44px rows", () => {
  assert.match(SHEET, /items-end justify-center[^"]*sm:items-stretch sm:justify-end/);
  assert.match(SHEET, /max-h-\[88dvh\]/);
  assert.match(SHEET, /rounded-t-2xl/);
  assert.match(SHEET, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.doesNotMatch(SHEET, /min-h-10\b/);
  assert.match(SHEET, /flex flex-wrap gap-2/);
  assert.doesNotMatch(SHEET, /text-\[(?:9|10|11)(?:\.\d+)?px\]/);
});

test("Theme update notice clears the safe area and cannot outgrow the phone", () => {
  // Toast docks above the home indicator; builder card is top-docked (F94) with max-h.
  assert.match(NOTICE, /bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(NOTICE, /max-h-\[60dvh\]/);
  assert.match(NOTICE, /min-h-11/);
});

const CAL = read("../admin/shell/internal/talent/agenda/AgendaCalendarPage.tsx");
const MONEY = read("../talent/money/MoneySpine.tsx");
const SERVICES = read("../talent/services/EditorScreen.tsx");

test("Calendar never strands a phone on the month grid, which has no phone layout", () => {
  assert.match(CAL, /window\.matchMedia\("\(max-width: 720px\)"\)/);
  assert.match(CAL, /v === "month" \? "week" : v/);
  assert.match(CAL, /view === "month" && !phone/);
  assert.match(CAL, /view === "week" && !phone/);
});

test("Money: table collapses to cards and tabs are 44px and scroll instead of overflowing", () => {
  assert.match(MONEY, /\[data-money-desk-table\] \{ display: none/);
  assert.match(MONEY, /\[role="tablist"\] \{ overflow-x: auto/);
  assert.match(MONEY, /\[role="tab"\] \{ min-height: 44px/);
});

test("Services preview is a bottom sheet under sm", () => {
  assert.match(SERVICES, /items-end justify-center bg-black\/40 sm:items-center/);
  assert.match(SERVICES, /max-h-\[88dvh\][^"]*rounded-t-2xl/);
});
