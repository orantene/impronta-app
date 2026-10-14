import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const thread = readFileSync("src/components/support/SupportThreadView.tsx", "utf8");
const header = readFileSync("src/components/support/SupportThreadHeader.tsx", "utf8");
const home = readFileSync("src/components/support/SupportPanelHome.tsx", "utf8");

test("TUL-942: the in-bubble talk-to-human button is skipped when an offer card exists", () => {
  assert.match(thread, /hasOfferCard/);
  assert.match(thread, /canOfferHuman\(ticket\) && !hasOfferCard/);
});

test("TUL-943: the No button stays after escalation and just dismisses the row", () => {
  assert.match(thread, /canOfferHuman\(ticket\) \? onRequestHuman : \(\) => setAcked/);
});

test("TUL-948: the thinking bubble goes through shouldShowThinking", () => {
  assert.match(thread, /shouldShowThinking\(thinking, messages\)/);
});

test("TUL-944: the thread header title and status may wrap instead of ellipsis", () => {
  assert.match(header, /WebkitLineClamp: 2/);
  assert.doesNotMatch(header, /whiteSpace: "nowrap"/);
});

test("TUL-949: the ask box is a form so Enter on any mobile keyboard submits", () => {
  assert.match(home, /<form[\s\S]*onSubmit=/);
  assert.match(home, /enterKeyHint="send"/);
});

const launcher = readFileSync("src/components/support/SupportLauncher.tsx", "utf8");
const geometry = readFileSync("src/components/support/support-panel-geometry.ts", "utf8");

test("TUL-982: the compact launcher sits above the tab bar, not at 62% of the viewport", () => {
  assert.doesNotMatch(launcher, /"62%"/);
  assert.match(launcher, /SUPPORT_LAUNCHER_COMPACT_BOTTOM/);
  assert.match(geometry, /84px \+ env\(safe-area-inset-bottom/);
});

test("TUL-947: the launcher lifts above the offline banner and hides with the keyboard", () => {
  assert.match(geometry, /data-tulala-offline-banner/);
  assert.match(geometry, /input:focus, textarea:focus/);
  assert.match(launcher, /SUPPORT_LAUNCHER_COMPACT_CSS/);
});

test("TUL-916: the panel close button has its own accessible name, not 'Cerrar'", () => {
  const panel = readFileSync("src/components/support/SupportPanel.tsx", "utf8");
  assert.match(panel, /aria-label=\{t\("dashboard\.adminSupport\.closeAria"\)\}/);
  assert.match(home, /aria-label=\{t\("dashboard\.adminSupport\.closeAria"\)\}/);
  const es = JSON.parse(readFileSync("messages/es.json", "utf8")).dashboard.adminSupport;
  assert.ok(!/^Cerrar$/.test(es.closeAria), "must not be a substring of 'Cerrar tu cuenta'");
});

test("TUL-904/907: More sheet 'Get help' closes the sheet and opens the Guide home (support panel); sheet is mobile-only", () => {
  const more = readFileSync("src/components/talent/studio/MoreScreen.tsx", "utf8");
  assert.match(more, /onClose\(\);\s*openGuideHome\(\)/);
  assert.match(more, /min-\[721px\]:hidden/);
  assert.match(more, /min-h-\[44px\]/);
});

test("TUL-600: the new-ticket form lets you pick screenshots and uploads them after create", () => {
  const forms = readFileSync("src/components/support/SupportPanelForms.tsx", "utf8");
  assert.match(forms, /type="file"/);
  assert.match(forms, /uploadSupportAttachment\(r\.ticketId, f\)/);
  for (const l of ["en", "es", "fr"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard.adminSupport;
    assert.ok(m.fieldAttachments, `${l} fieldAttachments`);
  }
});
