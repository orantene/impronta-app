/**
 * TUL-1917 + TUL-1918 · the keep-talents picker is the top layer when the owner downgrades to Free, and the workspace
 * plan screens speak the dashboard language (en + es) with a locale-aware UTC calendar date.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatPeriodDate } from "@/lib/billing/period-date";

const web = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SC = "src/components/admin/site-control-center";

function zOf(src: string, marker: string): number {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, `${marker} present`);
  const m = /z-\[(\d+)\]/.exec(src.slice(at, at + 400));
  assert.ok(m, `${marker} carries a z-[n] class`);
  return Number(m[1]);
}

test("the keep picker layers above the plan sheet, the shell mobile sheet and the page-level drawers", () => {
  const picker = web(`${SC}/downgrade-keep-picker.tsx`);
  const sheet = web(`${SC}/upgrade-modal.tsx`);
  const sheetZ = Math.max(...[...sheet.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1])));
  const overlayZ = zOf(picker, "<Dialog.Overlay");
  const contentZ = zOf(picker, "<Dialog.Content");
  assert.ok(overlayZ > sheetZ, "picker overlay above the plan sheet");
  assert.ok(contentZ > overlayZ, "picker content above its own overlay");
  assert.ok(overlayZ > 270, "above the highest shell drawer layer (270)");
});

test("opening the picker closes the plan sheet first, and backing out brings the sheet back", () => {
  const g = web(`${SC}/global-upgrade-modal.tsx`);
  const open = g.slice(g.indexOf("function openKeepPicker"), g.indexOf("function handleKeepConfirm"));
  assert.match(open, /setOpen\(false\)/, "sheet closes when the picker opens");
  assert.match(g, /onCancel=\{\(\) => \{[\s\S]*?setOpen\(true\)/, "Escape / Volver reopen the sheet");
  const confirm = g.slice(g.indexOf("function handleKeepConfirm"), g.indexOf("const activePlan"));
  assert.doesNotMatch(confirm, /setOpen\(true\)/, "a successful downgrade does not reopen the sheet");
});

test("the picker is a modal dialog, so focus moves into it and Escape asks to cancel", () => {
  const picker = web(`${SC}/downgrade-keep-picker.tsx`);
  assert.match(picker, /<Dialog\.Root open=\{open\} onOpenChange=\{\(next\) => !next && !pending && onCancel\(\)\}>/);
  assert.doesNotMatch(picker, /modal=\{false\}/);
  assert.match(picker, /<Dialog\.Title/);
});

const UPGRADE_MODAL_KEYS = [
  "kicker", "title", "description", "cycleLabel", "monthly", "annual", "twoMonths", "close", "custom", "salesLed", "forever",
  "perMonth", "perMonthYearly", "ctaCurrent", "ctaSales", "ctaUpgrade", "ctaDowngrade", "badgeCurrent", "badgePopular",
  "footnote", "talkToUs", "noWorkspace",
];

test("every plan-sheet string exists in en and es, and the sheet renders no English literal", () => {
  type Bag = { tagline: Record<string, string>; feature: Record<string, string> } & Record<string, unknown>;
  const read = (l: string) => (JSON.parse(web(`messages/${l}.json`)) as { dashboard: { adminShared: { upgradeModal: Bag } } }).dashboard.adminShared.upgradeModal;
  const en = read("en");
  const es = read("es");
  for (const k of UPGRADE_MODAL_KEYS) {
    assert.ok(typeof en[k] === "string" && en[k], `en.${k}`);
    assert.ok(typeof es[k] === "string" && es[k], `es.${k}`);
  }
  assert.deepEqual(Object.keys(es.tagline).sort(), Object.keys(en.tagline).sort());
  assert.deepEqual(Object.keys(es.feature).sort(), Object.keys(en.feature).sort());
  const raw = web(`${SC}/upgrade-modal.tsx`);
  const src = raw.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const id of [...src.matchAll(/\bid: "(\w+)"/g)].map((m) => m[1])) assert.ok(en.feature[id] && es.feature[id], `feature ${id}`);
  for (const key of ["free", "website", "studio", "agency", "network"]) assert.ok(en.tagline[key] && es.tagline[key], `tagline ${key}`);
  for (const s of [...Object.values(en), ...Object.values(es), ...Object.values(en.tagline), ...Object.values(es.tagline), ...Object.values(en.feature), ...Object.values(es.feature)]) {
    if (typeof s === "string") assert.doesNotMatch(s, /—/, "no em dash");
  }
  for (const literal of ["Choose your plan", "Plans & billing", "Most popular", "Upgrade to ", "Downgrade to ", "Talk to sales", "Current plan"]) {
    assert.ok(!src.includes(literal), `no hard-coded "${literal}" in the sheet`);
  }
});

test("billing dates print the UTC calendar day in the viewer's language, on the account page, the toast and the trial/override rows", () => {
  assert.equal(formatPeriodDate("2026-11-22T02:00:00Z", "es"), "22 de noviembre de 2026");
  assert.equal(formatPeriodDate("2026-11-22T02:00:00Z", "en"), "November 22, 2026");
  assert.equal(formatPeriodDate("2026-11-22T23:30:00Z", "es"), "22 de noviembre de 2026");
  const page = web("src/app/(workspace)/[tenantSlug]/admin/account/page.tsx");
  assert.match(page, /formatPeriodDate\(billingState\?\.currentPeriodEnd, locale\)/);
  assert.doesNotMatch(page, /toLocaleDateString\("en-US"/);
  assert.doesNotMatch(page, /formatPeriodDate\([^)]*"en"\)/);
  const g = web(`${SC}/global-upgrade-modal.tsx`);
  assert.match(g, /formatPeriodDate\(effectiveAt, locale\)/);
  assert.doesNotMatch(g, /toLocaleDateString\(\)/);
});

test("TUL-1919: the agenda NOW block label goes through the agenda copy, with an es catalog entry", () => {
  const box = web("src/components/admin/shell/internal/talent/agenda/primitives/NowBox.tsx");
  assert.match(box, /copy\.t\("Now"\)/);
  assert.doesNotMatch(box, />\s*Now\s*</);
  assert.match(web("src/lib/talent-agenda/agenda-i18n.ts"), /Now: "Ahora"/);
});
